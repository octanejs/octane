# Metrics binding activation: bounded application diagnostic

This manually selected, non-production experiment copies Signal Chat into a
temporary build and keeps all five independent island records, the document
signal owner, streaming and stylesheet. It combines the earlier experimental
islands-first bootstrap with a binding activator for Metrics. The real example
and framework are not edited. The build overlays the frozen shared Metrics
frame and six files in `overlay/`; the extracted Metrics actions are the same
authored view for server rendering, the ordinary renderer and the candidate.
This changes generated SSR binding markers and is not a byte-identical copy of
the original application. The prior `metrics-shared-view` checkpoint separately
compares the unmodified app with an earlier ordinary-renderer refactor.

The selector is a fixture-specific shape and pinned site/build/owner check, not
an automatic compiler proof or a general DOM eligibility test. If selection
returns false or throws, the original Metrics activator remains reachable and
is selected before the island registry hands over its queued intents. The
candidate attaches the outer frame, timer and action behavior while leaving the
pending `@try` range owned by the existing server stream. It binds the actions
when the session is ready. Its controller intentionally assumes this pinned
one-shot document session; it is not a solution for general refresh, remount,
late ownership transfer or recovery. The islands-first root itself remains a
separate, manually asserted experimental lifetime condition.

## Observed result

One same-build localhost Chromium 149 run with cache disabled produced:

| JS observed | Ordinary Metrics | Binding Metrics |
| --- | ---: | ---: |
| Startup, CDP encoded transfer | 158,239 B (17 requests) | 75,036 B (16 requests) |
| Startup, encoded response bodies | 153,403 B | 70,551 B |
| Cumulative after Composer activation and Send, CDP encoded transfer | 159,813 B (18 requests) | 173,100 B (18 requests) |
| Cumulative after Send, encoded response bodies | 154,684 B | 167,965 B |

The startup transfer difference is 83,203 B in this local sample. The binding
startup requests exclude both the original Metrics activation and the renderer;
the first Composer interaction requests the renderer, after which the candidate
has transferred more. CDP `Network.loadingFinished.encodedDataLength` is a
transfer count and includes CDP-reported network overhead; the body figures
come separately from `PerformanceResourceTiming.encodedBodySize`. Each response
and its content encoding are retained in the browser report. These are neither
production traffic nor timing, TTFI, or sustained performance measurements.
The paired arms use the same refactored application and experimental bootstrap,
so the figures are not an unchanged-app comparison or an automatic-optimizer
saving.

The emitted graph retains the ordinary Metrics fallback and every emitted JS
file. Offline gzip-9 sums per file are 53,064 B for the candidate's static
closure, 139,611 B for the ordinary Metrics static closure and 178,747 B for
all reachable JS; those closures overlap and are not browser transfer totals.
The stylesheet's offline gzip-9 sum is 2,229 B. A separate HTTP head check
observed five island sidecars and the same stylesheet in all four modes. Page
preload counts were zero for the two islands-first Metrics arms and one for the
forced ordinary-root and `/eager` controls.

## Behavioral checks and limits

The 20 browser cases exercise pending-before-activation and ready behavior,
initial server rejection, a 400 ms timer, a single joined document session
loader, JSON export and a forced 503, the trace link, node identity, focus and
native `details.open`, and timer cleanup. An exact retained trusted click while
binding actions are held produces one export; replacing the target or detaching
the island produces none. A deliberately malformed late actions region reports
adoption failure and disposes the claimed frame/controller. It does not recover
the view through the renderer. False/throwing selection and one malformed
outer-frame shape choose ordinary activation before claim; that shape test does
not validate arbitrary DOM.

The actual Metrics marker uses the `load` strategy. When selection was held, a
trusted preactivation click was not replayed by either ordinary or binding
activation. A separate diagnostic temporarily changed only that marker from
`load` to `interaction`, clicked with the keyboard, and restored `load` before
releasing selection. On that synthetic path the candidate replayed one retained
target once, skipped a replaced target, and replayed two retained clicks twice;
the ordinary renderer replaced its original target and replayed none. This is
not evidence that real Metrics uses interaction-triggered capture. Unsupported
intents or a context mismatch after selection can invoke an asynchronous
ordinary fallback with a known interval in which new events are not queued.

Two reachable late-state negatives remain. Resetting the ready session made its
signal pending while the already-bound success actions remained visible. In the
transport-loss case a proxy cut the actual document stream after the pending
range, sidecar and bootstrap had arrived. After the receiver timed out, the
joined signal reported error but the pending server UI remained visible; its
controller and timer were still live at that observation, before the page was
closed. This is an HTTP transport cut, not a `$OCTRX` error frame, and is not
transparent failure recovery. No
private sentinel takeover or general handoff is implemented.

The paired Send cases assert no canceled RPC before a synthetic non-persisted
`pagehide`; afterward each recorded exactly one
`/_$_ripple_rpc_$_/8b3cc558 net::ERR_ABORTED`, with the server answer producer
observed in `start`, `abort`, `finally` order and no completion. The intentional
transport cut produced four identical documented server disconnect diagnostics;
all other cases produced no server diagnostics. The driver asserts other
page errors and failed requests; it allows the favicon 404 and records exactly
one deliberately injected trace 503 in each paired arm and none in the other
cases. The browser test does not establish full navigation/BFCache,
all overlapping exports, native user-activation parity, post-claim fallback,
refresh/reselection or later stream-failure parity. Preprojected timing and log
rows allocate on updates; CPU and garbage-collection cost were not measured.
The overlay compiles through Octane/Vite, but `tsrx-tsc` is not linked in this
checkout and a `.tsrx` typecheck was not run.

## Reproduce

With the repository's existing dependencies and an authorized installed Chromium:

```sh
node benchmarks/streamed-shell-prototype/metrics-binding-candidate/build.mjs
node benchmarks/streamed-shell-prototype/metrics-binding-candidate/graph.mjs /absolute/path/printed/by/build
node benchmarks/streamed-shell-prototype/metrics-binding-candidate/head-check.mjs /absolute/path/printed/by/build
PLAYWRIGHT_EXECUTABLE_PATH='/absolute/path/to/chromium' \
  node benchmarks/streamed-shell-prototype/metrics-binding-candidate/browser.mjs \
  /absolute/path/printed/by/build /absolute/path/to/new-browser-report.json
```

The recorded checkpoint is `octane-metrics-binding-F5APJG` in the system
temporary directory. `build-report.json` hashes the copied application,
overlays, selected toolchain and emitted artifacts. `graph-report.json` links
the build hash and checks the original fallback edge. The browser report
`binding-browser-report-trace-oracle.json` links the build, checks those inputs
again after the run, and records its own unchanged driver hash, network requests
and expected diagnostics. The earlier `binding-browser-report.json` is preserved
as the prior, less restrictive diagnostic run. `ssr-head-report.json`
was an initial inspection; the reproducible `head-check.mjs` saves a fresh
non-overwriting evidence directory with four actual HTML bodies and their hashes.
The final result is `ssr-head-check-drvZbD/report.json` under the same build
directory. The hashes do not fully identify all installed dependencies, the host
OS or Chromium.
