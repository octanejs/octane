# Static-shell applicability checkpoint

The experiments show a substantial **initial delivery** opportunity when an
entire renderer can be deferred or omitted for a whole static document. The
real-site result uses a narrow source classifier and a fixed-output gate; it
does not establish a general automatic static-shell optimization, or a
reduction in the code delivered after the user activates the composer.

## Real streaming application

The [Metrics binding diagnostic](metrics-binding-candidate/README.md) uses one
refactored Signal Chat build for both arms, preserves its five island records,
and keeps the ordinary Metrics activator as a fallback. In one cache-disabled
localhost Chromium sample, CDP-reported JavaScript transfer was:

| Observation | Ordinary Metrics | Binding candidate | Difference |
| --- | ---: | ---: | ---: |
| Startup | 158,239 B | 75,036 B | -83,203 B (-52.6%) |
| After Composer activation and Send | 159,813 B | 173,100 B | +13,287 B (+8.3%) |

The first composer interaction requests the renderer before Send. The result
therefore demonstrates deferral, not its removal from the application's
reachable graph. The candidate's complete reachable graph is 178,747 B gzip-9;
that includes both candidate and fallback files and is not a paired comparison
with an unchanged application. The samples measure bytes, not interaction
latency or production performance. See the diagnostic for separate response
body sizes, controls, reproduction, and the observed differences from the
original application.

The binder has known unsupported late states: a ready-to-pending session can
leave success actions visible, and a cut document stream can leave pending UI
visible after the joined signal reports an error. Ordinary activation before
any binding claim is the fail-closed choice when the required ownership and
lifetime facts are unknown. The candidate is not a production implementation.

## What was proved automatically

The [Landing source classifier](static-document-analysis/README.md) recognizes
the real MCP landing page within a closed grammar. Its result is combined with
an explicitly asserted whole-document lifetime and fixed pins on the route,
server and client outputs in the [static-document experiment](static-document/README.md).
An added comment is accepted end to end; an event handler or changed emitted
output retains ordinary hydration. The classifier does not infer lifetime or
analyze the module graph, and the fixed pins decline even safe changed content.

The [generated scalar proof](generated-bindings/README.md) automatically
accepts a very small whole-module syntax and defers the renderer in a synthetic
streaming fixture. Its initial individually gzipped files were 106,003 B with
the renderer and 35,124 B with bindings; all reachable files including fallback
were 111,548 B for the candidate. Its host explicitly guarantees the slot's
lifetime and supplies the snapshots: the source proof does not infer those
facts. A scan found 0 of 38 authored example `.tsrx` files matched the current
whole-module whitelist. It includes client-only examples, excludes `.tsx`, and
is neither a component-level census nor an upper bound on eligibility.

The original [static-parent experiment](RESULTS.md), which retains the
renderer for an interactive child, saved 1,086 B gzip-9 (1.7%) with its
handwritten specialized surrogate. Its streamed-shell variant saved 520 B
(0.4%) under its narrower accounting. Those are fixture results without a
general fallback, not application or network savings.

Octane already has an explicit
[`<Hydrate split={false} when={never()}>` boundary](../../docs/deferred-hydration.md)
for a server-only static range. Its compiler removes the descendants and
exclusively owned private declarations from the client output, and hydration
preserves the server range. A client-only mount renders no children for this
exact form. Lexically nested independent boundaries are rejected; a descendant
reached through another component is rendered inert under the static owner, so
live independent descendants are not supported. No current example uses the
exact `never()` form; applying it automatically would still require proof that
its stronger lifetime and ownership contract is appropriate.

## Representative sites

The following source review is a small set of leads and counterexamples, not a
claim that other components cannot qualify:

| Site | Evidence and unresolved lifetime | Observed removable client code |
| --- | --- | --- |
| [Signal Chat App](../../examples/signal-chat/src/App.tsrx) | Its `eager` prop changes markup and form destinations, and it contains five independent islands. The manual islands-first path does not prove the composed root will never update or remount. | The binding diagnostic defers the page, Metrics activator, and shared renderer at startup; they remain reachable for fallback or other islands. |
| [Cinebase App](../../examples/cinebase/src/App.tsrx) | The app has navigation, state and effects. Its graph's static-looking `EditorialFallback` is used by Suspense and can be mounted again. | No safe transformed build has shown a removable template or module. The captured entry contains both the App and the renderer. |
| [Hacker News pending view](../../examples/hacker-news/tsrx/Pending.tsrx) | Router-controlled pending views can remount; the root has reactive router state, an outlet and a client-only mount path. | No retained emitted graph proves a removable template or module. |
| [Octane MCP landing page](../../website-mcp/src/app/Landing.tsrx) | A whole SSR route has native links, private literal data and no authored client state, effects or child components. Omitting its bootstrap requires an explicit document-only lifetime and changes client mismatch recovery and development behavior. | The [static-document experiment](static-document/README.md) reduced startup JavaScript response bodies from 91,578 B to zero in one local sample. All 114,344 B of emitted gzip-9 JavaScript remained available, including fallback. A narrow classifier selects the source under fixed output pins; this is not a general optimizer or an interactive-parent result. |

The existing [Vite graph report](graph/README.md) provides module and syntactic
component clues. It cannot prove a component's lifetime, prop stability,
effects, remount behavior or independently compressed contribution. These
unknowns must retain the ordinary path.

## Boundary for further work

The document signal receiver's inactivity timeout does not establish that an
HTML stream range is terminal. Removing a pending sentinel can discard a later
carrier before its native signal seeds are adopted. Existing binding leases do
not provide an atomic transfer of this opaque streamed range to the renderer.
The [recovery probe](opaque-recovery/README.md) covers a narrower, manual
stop-then-adopt case and does not solve general handoff or controller state.

A useful next implementation needs a real SSR site whose lifetime, props,
module effects, CSS and streamed ownership can be justified, followed by a
matched build that measures the actually unreachable code with fallback
included. If that site still requires the shared renderer immediately, its
expected saving should be compared with the small parent-shell result before
adding new runtime machinery. A renderer-free interactive Composer would be a
separate controller/compiler experiment, not an automatic consequence of an
inert shell. A general streamed-range handoff would likewise require its own
ownership, seed, event and failure contract.

An adversarial source check also exposed a separate SSR compiler defect:
valid module bindings such as `__props`, `__items` and `Array` can collide with
generated parameters, locals or builtin references in keyed loops. A real
`renderToString` reproduction observed missing rows and runtime errors; this
defect remains unfixed. The current Landing classifier rejects those bindings,
and the emitted-output gate does not select the reproduced inputs. The
reproduction is [`ssr-name-collision.mjs`](ssr-name-collision.mjs), runnable
with `node benchmarks/streamed-shell-prototype/ssr-name-collision.mjs` from an
installed checkout; the owning compiler is
[`compile.js`](../../packages/octane/src/compiler/compile.js).
