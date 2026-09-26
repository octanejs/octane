# Static shell with a live child

The [applicability checkpoint](APPLICABILITY.md) summarizes the real-app
delivery result, automatic proof coverage, ownership limits and next decision.

This directory also contains an [automatically admitted scalar bindings proof](generated-bindings/README.md),
a [rich streaming comparison with renderer fallback](RICH-FALLBACK-RESULTS.md), and a
[Signal Chat renderer-size investigation](runtime-size/README.md). The first two
reduce initial JavaScript for their fixtures; neither establishes an automatic
saving for Signal Chat. The experiment described below is the original static
parent-shell comparison. A separate [Metrics graph diagnostic](metrics-gate/README.md)
tests which initial renderer dependencies would need to change in Signal Chat.
The [streaming ownership probe](metrics-binding-race/README.md) demonstrates why
a binding host must coordinate with unresolved server ranges.
The [opaque frame probe](opaque-metrics-frame/README.md) keeps a server-owned
range inside a live bound frame and identifies an unsupported abort case.
The [recovery probe](opaque-recovery/README.md) tests a bounded stop-then-adopt
fallback after that abort, including failure and cleanup controls.
The [shared Metrics presentation](metrics-shared-view/README.md) compares the
original and a binding-compatible refactor using ordinary hydration. In one
local browser sample, initial JavaScript bodies rose from 148,653 B to 150,298 B;
the complete reachable gzip-9 graph rose from 154,803 B to 156,385 B. Those are
refactor costs, before any binding activator or performance claim.
The [islands-first checkpoint](islands-first/README.md) exercises the real route
without hydrating its composed root, but retains the initial renderer download.
The [delivery checkpoint](islands-first-delivery/README.md) defers the root's
renderer import and page preload in that route; its load-triggered Metrics
island still requests the renderer, so the observed saving is small.
The [Metrics binding diagnostic](metrics-binding-candidate/README.md) defers
that renderer request in a manually selected chat route, but exposes unsupported
late signal and stream failures and transfers more code after Send.
The [static-document checkpoint](static-document/README.md) uses the real MCP
landing route, a [narrow source classifier](static-document-analysis/README.md)
and fixed output pins to omit startup JavaScript for a wholly static document,
while retaining ordinary fallback assets.
The [async activator probe](async-intent-probe/README.md) checks event and
disposal ordering for a custom independent island.

This is a narrow production-bundle experiment, not an automatic optimizer. The
server always renders the same `.tsrx` shell and live counter. The baseline
hydrates that shell normally. Each candidate hand-writes a hydration-only
surrogate for that exact existing DOM and calls the live child through Octane's
private compiler ABI. The server compiler's component invocation site must match
the surrogate's site; the build checks this. No candidate implements fresh
mount, root updates, remount, mismatch recovery, or a full fallback.

The fixture includes shell-only code, a shell-only module side effect, a shared
module with an observable client side effect, a dynamic child dependency, and a
stylesheet. The build fails if the candidate retains the shell-only modules or drops the shared dependency,
dynamic dependency, or stylesheet. It records all statically and dynamically
reachable JS chunks, module contributions, CSS, full HTML, and raw/gzip-9/
Brotli-11 per-physical-file totals. The generated HTML has no inline executable
script. These are file sizes, not transferred bytes or runtime measurements.
Results exclude any fallback that a general implementation would require.
Both comparisons use Vite's production library-mode ESM build; they do not
include an application route or its generated bootstrap. The fixture explicitly
imports its CSS in each entry, so it does not prove automatic CSS discovery.

The variants make code reachability differences visible:

- `baseline`: compiled shell and production compiler-proven void root.
- `candidate`: generic root and component slot with a handwritten shell surrogate.
- `rootvoid`: only the compiler-only void-root helper changes.
- `slotvoid`: only the compiler-only void-component slot changes.
- `slotflags`: only the compiler's conditional single-root flag changes.
- `optimized`: both void specializations and the single-root flag.
- `drop-effect`: a deliberately incorrect negative control that omits the
  shell-only side effect and must not be treated as an equivalent candidate.

The specialized helpers are only valid when their respective void contracts
are proven. This experiment asserts those contracts for its authored fixture;
it does not infer them for arbitrary application code. The site and DOM lookup
are fixed by hand, and the output includes the remaining full renderer needed by
the counter. All valid candidates explicitly import the shell-only effect; this
stands in for an optimizer preserving the effect and is not automatic graph
analysis. Shared code, CSS, and the on-demand chunk are included in comparisons.
Checks assert both effects' order. The negative control shows that omitting the
shell-only effect changes observable state.

Run from the checkout with its installed dependencies and a fresh directory
outside the repository:

```sh
node benchmarks/streamed-shell-prototype/run.mjs --output-dir=/absolute/new-output
node benchmarks/streamed-shell-prototype/verify-jsdom.mjs --build-dir=/absolute/new-output
```

The jsdom check loads the actual emitted ESM and dynamic chunk in a separate
Node process per variant. It checks adoption, focus, two counter updates,
shared-module evaluation, and reported errors. It does not prove browser
network, native input, CSS, or real-device behavior. `report.json` and
`jsdom.json` retain build and check provenance. The browser check additionally
holds the entry until it can record the server DOM, then verifies identity,
focus, updates, CSS, and the on-demand request:

```sh
PLAYWRIGHT_EXECUTABLE_PATH=/absolute/approved/browser \
  node benchmarks/streamed-shell-prototype/verify-browser.mjs --build-dir=/absolute/new-output
```

Choose an installed browser explicitly and follow the host's browser policy;
the script does not install one. `browser.json` is written only after the
checks pass. Both checks also preserve an untouched static sibling after the
live child. These controls cover the static counter fixture, not streamed
signal identity or later stream waves.

The separate streamed-shape build uses the actual authored shell and surrogate
from `packages/octane/tests/hydration/streamed-static-shell.test.ts`, with the
same generic hydration and stream receiver in each entry:

```sh
node benchmarks/streamed-shell-prototype/streamed-build.mjs --output-dir=/absolute/new-streamed-output
```

It records the complete reachable client JS only. The live child and shell share
one source module, so module retention is expected; the report separately checks
whether the static shell template text is emitted. It does not measure HTML,
CSS, inline frames, fallback code, network bytes, or generated app bootstrap.
The related test covers an already-resolved first result, a later result before
or after activation, interactive child updates and cleanup. Its surrogate
explicitly rejects the pending arm and is not a general hydration replacement.

For a separate, matched streamed-signal comparison, use the existing rich
presentation fixture's `--rich-presentation=authored` and `renderer` Vite
builds and its `runRichBrowser` workload as documented in
[`../conversation-streaming/behavior-only/README.md`](../conversation-streaming/behavior-only/README.md).
That fixture compares a renderer-free binding program against the full renderer
for a different, live-updating presentation; it does not measure this shell
surrogate.

The recorded measurements and limitations are in [RESULTS.md](RESULTS.md), and
the comparison with Qwik's mechanics is in [QWIK.md](QWIK.md). The separate
[Vite graph report](graph/README.md) explores how much component and module
information a build can observe without changing its output.
