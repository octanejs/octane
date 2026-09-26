# Renderer-free streaming behavior workload

The default production-built workload is separate from the parent suite's independently
hydrated component fixture. It keeps conversation/history lists server-owned and
never imports a client component,
`hydrateRoot`, or a rendering engine in the browser graph.

The separate `richPresentation` comparison below uses the same authored view for
SSR and live text, conditional content, keyed lists, and a map fixture. Its
`renderer` control deliberately retains the full renderer; all other modes keep
the renderer-free dependency guard.

The host emits public `earlySignalBootstrapScript()` before interactive HTML. The
SSR shell contains the real native signal manifest and selected query
authority. A one-shot `StreamOptions.injection` source places the identity metadata
and classic `import()` launcher after the complete shell at a renderer-owned HTML
boundary. The document wrapper forwards every renderer chunk unchanged; it does
not treat the first read as the complete shell. The launcher starts one split ESM
behavior graph before the auth-gated document reaches EOF. An optional
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

The server regression exercises the real fixture with renderer output split inside
tags, native seed JSON, query selection JSON, and UTF-8 characters before the
document wrapper reads it. It checks complete seeds and authority before the
launcher while authorization and EOF stay held, then checks final output after
release:

```sh
node --test benchmarks/conversation-streaming/behavior-only/server.test.mjs
```

Build only, with existing installed dependencies:

```sh
node benchmarks/conversation-streaming/behavior-only/build.mjs
# Separate query-free composer startup with a later real query consumer:
node benchmarks/conversation-streaming/behavior-only/build.mjs --composer-receipts --bundler=vite
# Equal-work primary-action projection comparison, in separate output directories:
node benchmarks/conversation-streaming/behavior-only/build.mjs --composer-receipts --bundler=vite --projection=manual
node benchmarks/conversation-streaming/behavior-only/build.mjs --composer-receipts --bundler=vite --projection=authored
# Rich authored streaming and its equal-work full-renderer control:
node benchmarks/conversation-streaming/behavior-only/build.mjs --bundler=vite --rich-presentation=authored
node benchmarks/conversation-streaming/behavior-only/build.mjs --bundler=vite --rich-presentation=renderer
```

`BENCH_BUILD_DIR=/absolute/artifact/directory` selects a durable output directory.
The default client bundler remains esbuild for historical comparisons.
`--bundler=vite` explicitly selects installed Vite/Rolldown; both paths use the
same public Octane compiler and authored fixture. The Node server remains an
esbuild bundle in both cases. Do not compare differently bundled results as a
runtime-change delta: build the same baseline and candidate with the same option.

The optional `projection` comparison adds the same server-authored button, two
icon spans and SVG descendants to both candidates. `manual` uses an ordinary
subscribe-to-DOM projection; `authored` lowers the typed `adoptBindings` call to
the compiler-proven view artifact. Both retain the same application snapshot
source, native listeners, explicit refresh, document signals, streams, and final
DOM. The default `none` preserves the original workload. Compare manual against
authored, not the original smaller fixture against the larger authored fixture.

Pass `projection: 'manual'` or `'authored'` to `runBrowser` with
`composerReceipts: true, bundler: 'vite'`. The runner checks reflected button
properties and real native `requestSubmit` in the same stack, the distinction
between boolean/ARIA/presence attributes, retained SVG/span identity, and
unowned visibility/style preservation. It separately records 1,000 repeated
unchanged projections and 1,000 alternating projections with equal final DOM.
`attributeMutations` is a deterministic browser MutationObserver record count,
not a render count. `durationMs` includes native event dispatch, shared snapshot
creation, projection and observer instrumentation, not paint or INP. The
alternating lane challenges a gain attributable only to skipping unchanged
writes. Compare identical browser/build/iteration settings, exclude warmups,
and keep these projection samples separate from auth-gated stream marks.

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

## Rich authored presentation

Import `runRichBrowser` from `rich/run-browser.mjs` with an explicitly launched
browser and `{ output, iterations: 3, presentation: 'authored' }`. Run the same
workload separately with `presentation: 'renderer'` and the same browser and
toolchain. Each mode has one excluded warmup and the requested measured samples.
Both use the same server shell, query sources, native draft control, data
projection, authored rich view, map controls, and navigation policy.

After one shared authorization, four interleaved body/history waves independently
revise the title, progress, paragraphs, links, and map places. The `stay` identity
lane activates the initially cold map before releasing authorization so it observes
every place-row lifetime. An observer captures the first nodes independently of
later click timing. One wave removes a prior row and reorders survivors; the final
wave reintroduces that row with fresh native nodes. Surviving nodes and map intent
must stay intact.

The `roundtrip` lane instead upgrades the placeholder through a cold map import
after initial streamed content appears, then selects a place and changes the
viewport. Its `postActivationState` is sampled after map visibility: incomplete
flags prove the stream was still running at that observation, while complete flags
leave the exact activation timing uncertain. Completed-stream catch-up needs
separate evidence that the map import remained held until after stream completion.
It does not assert deletion of place lifetimes that preceded map activation.

The `before` and `split` lanes hold the presentation entry while the response
continues to parse. They wait for both streams' actual result frames in the
browser's pre-module mailbox before allowing activation. The `before` lane waits
for both streams to complete; `split` holds both after revision 1 until the live
view is active, then delivers revisions 2–4. They check the exact visible
projection, selected original shell nodes and the draft edit, native map interaction,
selected survivor identity, disposal, loader counts, and recoverable hydration diagnostics.
The gate belongs to the request while each query remains independently abortable.
These lanes use document-owned module signals: they do not demonstrate that a
renderer-free view can own an instance-local streamed query.

Run the fixture gate's cancellation and ordinary-stream checks separately with:

```sh
node node_modules/vitest/vitest.mjs run --config benchmarks/conversation-streaming/fixture/vitest.config.mjs
```

The navigation lane disposes A's visible presentation, mounts B, lets any remaining
accepted A server work finish, and reconstructs A from the latest retained results and
per-conversation map intent. Late A results cannot change B. The document result
bridge outlives these view subscriptions; returning must not restart the loaders.
This is local SPA presentation continuity, not a claim of complete cached-HTML
placement or a production generation-reconnect protocol.

`rich-browser.json` records post-activation state, original-node identity, subscription and server trace
assertions, DOM-observation marks, HTML/inline/CSS raw and compressed bytes, and
startup/map-activation/eventual requested asset sets. Deduplicate physical files
against `build.json` before totaling each phase. The deliberately held auth and
400 ms inter-wave waits enable interaction; they are not renderer CPU timings.
The small cold zoom helper is not a production map SDK or its loading cost.
WebKit results are not native Safari or iOS device qualification.

### Renderer fallback measurement control

`--rich-presentation=fallback-control` adds the ordinary renderer as a lazy
fallback to the authored binding path. The query parameter `rendererFallback=1`
selects it before either presentation claims the DOM; without that parameter the
binding path runs. This parameter is a measurement control, not an eligibility
proof or a general mismatch recovery mechanism. In particular, this control does
not catch failures after binding adoption starts. The host supplies the same
explicit snapshot and subscription source as the other rich modes.

Run `runRichBrowser` with `presentation: 'fallback-control'` to exercise the
binding path, and again with `rendererFallback: true` to select the renderer.
The latter run holds the fallback chunk while the document and its signal frames
continue streaming in the delayed lanes. All modes check native draft edits,
streamed catch-up, keyed identity, map interaction, navigation, subscriptions
and loader counts. The runner also verifies that the renderer chunk is requested
only when selected. It does not capture navigation-button clicks made before the
host installs its handlers, and it does not prove late handoff from a claimed
binding region to a renderer.

The candidate's initial closure and its complete emitted graph answer different
questions. Include the renderer fallback when reporting total emitted bytes, and
report actual requested files separately. A matched local result and reproducible
commands are in [the fallback measurement](../../streamed-shell-prototype/RICH-FALLBACK-RESULTS.md).

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
