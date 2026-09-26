# Generated scalar bindings experiment

This is a benchmark-only experiment, not an Octane optimization. It proves a
very small unannotated `.tsrx` view eligible for the existing DOM bindings
compiler, then compares renderer-free activation with ordinary hydration. It
uses the existing conversation-streaming fixture's server, authentication gate,
two streamed signals and draft signal. The view is a new scalar-only fixture;
it is not the rich conversation view or the Signal Chat application.

`proof.mjs` accepts an entire module only when it consists of one exported,
non-async function with an empty setup and string-typed props used as text in
a restricted, fixed HTML tree. It rejects imports, calls, effects, dynamic
attributes, events, refs, control flow, child components and unsupported
markup. It inserts the existing binding directive into an in-memory copy of
accepted source; it does not mutate the parsed AST or authored file. The proof
can describe other names and fields, but this fixture's `build.mjs` selects the
bindings path only for its specific `ConversationStatus` host contract. Other
sources select the normal renderer. A read-only scan of the 38 authored
`.tsrx` files under `examples/`, excluding build output and dependencies, found
zero whole-module matches. This is a property of this intentionally narrow
whitelist, not an upper bound on the overall idea.

The proof does **not** establish that arbitrary props are pure or that the
component's owner has a stable lifetime. The benchmark host explicitly supplies
fresh plain string snapshots and one subscription; it owns the slot for its
whole lifetime and guarantees no parent renderer later hydrates, updates or
remounts it. The button and draft control are handled by the host, not inferred
from the view. The real streamed body and history signals update the snapshot.
There is no general component-graph analysis or production integration here.

Both measured modes use the same server output and authored view. The server
and client compile the same in-memory annotated source with the same filename
and compiler root, so the emitted binding stamp matches. Before activation,
the candidate checks a compiler-derived stamp, the exact host range and a
restricted static DOM shape. If the check fails or the host selects the
renderer, it loads the ordinary renderer **before any binding claim**. Errors
after claims are not caught as fallback. The ordinary renderer is still
reachable as a lazy chunk, and the benchmark accounts for it below.

The SSR view is inside the fixture's `<!--[-->...<!--]-->` range. As a
benchmark-only ownership adaptation, `transfer.ts` removes that exact pair
only when the slot contains exactly those three nodes, the expected root and
no nested comments. It preserves the root element and is shared by both modes;
the ordinary baseline does not import the binding descriptor or preflight.
Unknown shapes are passed intact to ordinary hydration. This transfer relies
on the explicit one-shot slot ownership above; it is not a general solution
for parent hydration, remounts, or arbitrary malformed DOM.

An incorrect binding stamp also selects the renderer before any binding claim.
The ordinary renderer can display and update the view while leaving that
incorrect, otherwise inert stamp in place. Selection of the renderer therefore
does not by itself guarantee that all mismatched attributes are repaired.

## Validation

From the repository root, using the installed dependencies:

```sh
node --test benchmarks/streamed-shell-prototype/generated-bindings/proof.test.mjs
node benchmarks/streamed-shell-prototype/generated-bindings/scan.mjs
PLAYWRIGHT_EXECUTABLE_PATH='/path/to/authorized/chromium' node benchmarks/streamed-shell-prototype/generated-bindings/run-browser.mjs
```

The browser runner rebuilds both variants, checks that common input hashes and
server output match, and asserts that the baseline does not include binding
artifacts. Its report records emitted module graphs, compressed sizes and
hashes, source inputs, requested chunks, and before/after DOM. The browser cases
exercise the baseline and bindings, a delayed renderer fallback after both
streams finish, malformed stamps and ranges, and a simulated `pagehide` while
the renderer import is pending. This is functional browser evidence, not a
latency or production performance measurement.

## Historical recovery observation

Before the accompanying runtime recovery fix, an unexpected text node after
the server range caused the candidate to select the ordinary renderer. That
renderer reported recoverable Octane error #51 but retained the unexpected
text. The historical temporary pre-fix browser report was named
`octane-auto-bind-bindings-NCxOxC/browser.json` and is not published here.
The exact affected slot before fallback was:

```html
<!--[--><section id="automatic-status" aria-label="Conversation status" data-octane-bindings="d:57bea3e2"><h1>Conversation status</h1><p id="automatic-response">Waiting for response</p><p id="automatic-history">Waiting for history</p><p id="automatic-interactions">Interactions: 0</p></section><!--]-->unexpected
```

After fallback and stream completion it was:

```html
unexpected<section id="automatic-status" aria-label="Conversation status" data-octane-bindings="d:57bea3e2"><h1>Conversation status</h1><p id="automatic-response">Response revision: 4</p><p id="automatic-history">History revision: 4</p><p id="automatic-interactions">Interactions: 1</p></section>
```

These are pre-fix observations; current behavior requires the fresh build and
browser run recorded below.

## Matched result after the recovery fix

The eight-case Chromium run on the fixed runtime passed. In the malformed-slot
case, ordinary hydration reported its recoverable mismatch and left exactly one
correct section, with no unexpected text. In the delayed fallback case both
streams reached revision 4 and completed while the renderer chunk was held;
after it loaded, the view reflected those latest values and retained the draft
typed before activation. The test also checks one server start per loader, no
client loader calls, and no duplicate active view subscription.

| Sum of individually gzipped emitted JavaScript files | Renderer | Generated bindings |
| --- | ---: | ---: |
| Initial static closure and browser requests on the successful path | 106,003 B | 35,124 B |
| All emitted files reachable with lazy fallback | 106,003 B | 111,548 B |

The successful candidate requested 70,879 B less gzip (66.9%) in this fixture.
If fallback is requested, the browser loads all 111,548 B, 5,545 B more than
the renderer baseline (5.2%). These are emitted-file gzip sums, not measured
wire transfer, load time or interaction latency, and they do not establish a
saving for an actual application. The browser used Chromium 149.0.7827.55.

The historical temporary artifacts for this run were named:

- Renderer build: `octane-auto-bind-renderer-MkcnVV/build.json`
- Bindings build: `octane-auto-bind-bindings-7Ls1Kk/build.json`
- Browser report: `octane-auto-bind-bindings-7Ls1Kk/browser.json`

These artifacts are not published with this repository. A new run can be
generated with the commands above; the reports record the hashes needed to
identify its inputs and outputs.
