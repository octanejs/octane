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

## Run

Build only, with existing installed dependencies:

```sh
node benchmarks/conversation-streaming/behavior-only/build.mjs
```

`BENCH_BUILD_DIR=/absolute/artifact/directory` selects a durable output directory.
The build writes `build.json`, a Node server bundle and split production browser
chunks. It records compiler options, transformed state hashes, exact consumed
source hashes, output hashes and raw/gzip-9/Brotli-11 sizes. It rejects any resolved
browser renderer input, including tree-shaken inputs, or source drift while
building. Output paths are local provenance, not deployment receipts.

For browser execution, import `runBrowser(browser, { output, iterations })` from
`run-browser.mjs` using an already launched Playwright browser, then close that
browser in `finally`. The runner owns and closes each context and its ephemeral
localhost server. It saves `browser.json` on success or failure. Browser selection
and required host execution permissions belong to the caller; no browser install
or silent fallback is performed. For example:

```js
const { runBrowser } = await import('/absolute/checkout/benchmarks/conversation-streaming/behavior-only/run-browser.mjs');
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
no old-implementation baseline, so candidate sizes alone establish no performance
improvement.

During a held HTML response, Playwright's `locator.click()` stability wait can
wait for animation-frame samples. The runner instead sends trusted pointer input
to measured visible bounds for the pre-EOF three-click check, and uses explicit
timer polling for behavior readiness while EOF is held. This is a harness
observation distinction, not evidence that an application or Safari is broken.
Playwright WebKit results must be labeled WebKit, not installed Safari or iOS
Safari. Installed Chrome policy failures are environment evidence, not product
failures, and do not authorize silently switching browser engines.
