# Renderer-free streaming behavior workload

This is a separate production-built workload, not the parent suite's independently
hydrated component fixture and not a lightweight-web deployment. It keeps the
conversation/history lists server-owned and never imports a client component,
`hydrateRoot`, or a rendering engine in the browser graph.

The host emits public `earlySignalBootstrapScript()` before interactive HTML. The
first SSR chunk contains the real native signal manifest and selected query
authority. A classic `import()` launcher immediately after that chunk starts one
split ESM behavior graph before the auth-gated document reaches EOF. An optional
controller imports the same physical state/engine chunk; there is no second IIFE
copy or hand-written state carrier. The host metadata uses its own identity schema
with `installSignalDocumentLifecycle({ readIdentity })`.

`State.ts` is compiled through the public `octane/compiler/bundler` integration in
both environments. It uses module-global `signal$`, `derived$`, and `query$`; both
private streams depend on the same authorization query. Backend authorization,
bounded test gates, deterministic body/history data and trace counters are reused
from the parent fixture. Server loaders are substituted at build time; browser
loaders fail and increment a visible counter if an SSR attempt is not joined.

The browser runner checks three distinct cases, one warmup each then three samples
each by default:

- Eager behavior while authorization and parser EOF are held: direct signal
  binding, immediate derived text, three trusted clicks, and revision-fenced late
  restore rejection even after native edits return to exactly the original text.
- All external modules held: native text edits survive into the real signal after
  module release. The pre-module derived output intentionally remains the server
  value: tiny capture is not a general synchronous reactive runtime.
- Pristine delayed restore: the framework control candidate is accepted and
  publishes through the same signal and derivation.

After authorization release both streams must finish without a browser loader,
with exact oracle data and one auth/body/history start each. The lists retain
their historical first-wave server HTML (5 body rows, 3 history rows); live signal
outputs and the optional controller see all four result waves (20/12 final rows).
This intentionally distinguishes historical HTML from live values. It does **not**
claim to benchmark renderer-free incremental transcript DOM updates or navigation
placement; those need a separate registered-region workload.

The optional **composer-receipts** mode uses the same server and query controller,
but its initial client observes only the draft and selected day. Its state is
factored into `receipt-state.ts` (initial signals) and `receipt-query-state.ts`
(cold queries), with `ReceiptState.ts` supplying the unchanged server shell and
optional controller. The original mixed `State.ts` remains the full-query control:
PURE annotations alone cannot move its genuinely used query declarations out of
an already-shared module in the esbuild control. A synchronous
`scope.derived$` produces an object-valued `{ value, revision }` receipt, matching
the shape of a composer persistence adapter. The receipt retains edits even when
the final text equals the server value; delayed restore checks both that revision
and the framework's native-control candidate. This mode adds a fourth case that
edits away from, then back to, the server value before modules load.

The receipt client uses `bootstrapStreamedSignalResults`: its server-owned lists
need result adoption but never register DOM placement. Its entire eventual graph
must omit that optional placement implementation. The full-query client keeps
`bootstrapStreamedSignalHydration` as a control for the existing full receiver
API; neither fixture claims to exercise actual registered-region DOM updates.

In this mode the streams complete into the existing document owner before the
optional application controller is imported. Live body/history outputs remain
empty until that controller reads the completed values; the browser must not
start a replacement loader or lose the current draft. The initial static chunk
closure must contain no request or asynchronous-derived implementation bytes,
while the eventual optional-controller graph must retain real query execution.
This is an application import boundary, not a runtime capability loader. The
default full-query case remains a negative control with its original native
derived string and eager query subscriptions. Receipt startup requires the
explicit Vite client build: esbuild currently assigns used exports of a shared
barrel to a common eager chunk even when their implementations live in separate
modules. The receipt guard intentionally fails under esbuild; it is not disabled
or replaced by a compiler import rewrite.

## Run

Build only, with existing installed dependencies:

```sh
node benchmarks/conversation-streaming/behavior-only/build.mjs
# Separate query-free composer startup with a later real query consumer:
node benchmarks/conversation-streaming/behavior-only/build.mjs --composer-receipts --bundler=vite
```

`BENCH_BUILD_DIR=/absolute/artifact/directory` selects a durable output directory.
The default client bundler remains esbuild for historical comparisons.
`--bundler=vite` explicitly selects installed Vite/Rolldown; both paths use the
same public Octane compiler and authored fixture. The Node server remains an
esbuild bundle in both cases. Do not compare differently bundled results as a
runtime-change delta: build the same baseline and candidate with the same option.

The build writes `build.json`, `client-metafile.json`, a Node server bundle and
split production browser chunks. It records client/server bundler versions and
options, compiler options, transformed state hashes, exact consumed
source hashes, output hashes and raw/gzip-9/Brotli-11 sizes. It rejects any resolved
browser renderer input, including tree-shaken inputs, any emitted independent-island
intent capture, or source drift while building. Native-control capture remains
available without loading island activation. Module contributions retain their
native labels: esbuild `bytesInOutput` and Rolldown pre-minification
`renderedLength` are not interchangeable byte costs; both support the zero-code
boundary guard. Final chunk sizes are directly measured for either bundler.
Output paths are local provenance, not deployment receipts.

For browser execution, import `runBrowser(browser, { output, iterations })` from
`run-browser.mjs` using an already launched Playwright browser, then close that
browser in `finally`. The runner owns and closes each context and its ephemeral
localhost server. It saves `browser.json` on success or failure. Browser selection
and required host execution permissions belong to the caller; no browser install
or silent fallback is performed. Pass `composerReceipts: true, bundler: 'vite'`
for the separate receipt workload. For example:

```js
const { runBrowser } =
	await import('/absolute/checkout/benchmarks/conversation-streaming/behavior-only/run-browser.mjs');
try {
	await runBrowser(browser, { output: '/absolute/artifacts/behavior-only', iterations: 3 });
} finally {
	await browser.close();
}
```

Typecheck the authored fixture with:

```sh
node node_modules/@tsrx/typescript-plugin/dist/tsc.js --noEmit -p benchmarks/conversation-streaming/behavior-only/tsconfig.json
```

## Observation limits

Browser marks are instrumented DOM-observation timestamps, not paint, input
latency, INP, or CPU profiles. The deliberately held auth interval includes test
driver time; do not compare end-to-end marks as an application speedup. Report
each mode separately and keep warmups out of samples. This workload currently has
no old behavior-host implementation baseline. The matched packaging comparison
against `9661ee423` in [the performance note](../../../docs/async-signals-performance.md#packaging-boundary-follow-up-2026-09-12)
measures byte savings only, not application latency improvements.

During a held HTML response, Playwright's `locator.click()` stability wait can
wait for animation-frame samples. The runner instead sends trusted pointer input
to measured visible bounds for the pre-EOF three-click check, and uses explicit
timer polling for behavior readiness while EOF is held. This is a harness
observation distinction, not evidence that an application or Safari is broken.
Playwright WebKit results must be labeled WebKit, not installed Safari or iOS
Safari. Installed Chrome policy failures are environment evidence, not product
failures, and do not authorize silently switching browser engines.
