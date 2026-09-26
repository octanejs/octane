# Rich streamed presentation: renderer fallback control

This is a matched measurement of the existing **authored** DOM-binding view,
not automatic conversion of the rich component or the Signal Chat route. Both
variants use the same server shell, streams, view, explicit snapshot source,
draft control, interactive map and navigation. The candidate keeps the normal
renderer in a lazy chunk. A query flag selects that renderer before binding
adoption begins; it is a test control, not a proof that arbitrary DOM or runtime
failures can safely fall back. In particular, it does not catch failures after
claiming DOM or support handoff from an already active binding region.

| Measurement | Renderer baseline | Bindings selected | Renderer fallback selected |
| --- | ---: | ---: | ---: |
| Initial requested JS, gzip-9 | 115,540 B | 44,270 B | 128,345 B |
| Requested JS after map activation, gzip-9 | 115,631 B | 44,361 B | 128,436 B |
| All emitted JS, including fallback, gzip-9 | 115,631 B | 128,436 B | 128,436 B |

The binding path requests **71,270 B less** initial gzip JavaScript (61.7%) for
this workload. The fallback-capable build emits **12,805 B more** total gzip
JavaScript (11.1%): its binding and renderer implementations coexist. The
9,603 B shared chunk is included in each candidate figure. The common inline
capture adds 457 B gzip in each variant and is reported separately from these
external scripts. Figures are sums of independently gzip-9-compressed files,
not measured network transfer, latency, parse time or paint.

Local Chromium 149.0.7827.55 ran the baseline, binding and selected-fallback
variants through four scenarios, once as a warmup and once as a measured sample.
The checks cover streamed updates, identity, an early draft edit, map actions,
navigation, subscriptions and loader counts. In the fallback's delayed lanes the
renderer chunk was held while the document and both streams continued, then the
draft and signal results survived activation. The lightweight lanes never
requested the renderer chunk; the selected-fallback lanes did. Early navigation
or map clicks while the fallback is loading are not captured or tested by this
host. There is no same-region post-adoption handoff or arbitrary mismatch proof.

The runs used Node v26.4.0, Vite 8.1.5 and Rolldown 1.1.5 at HEAD
`e813fc0e6dd017a58e3988cf0ac36fa8e28c187e`, with the recorded dirty workspace,
including the framed-root hydration recovery fix.
All 187 shared recorded inputs matched across the builds; the server artifact,
inline capture and browser driver hashes also matched. The individual output
hashes and requests were recorded in historical temporary directories:

- Baseline: `octane-behavior-only-ema9OB`
- Bindings: `octane-behavior-only-h3Em9t`
- Fallback: `octane-behavior-only-giaZoL`

These artifacts are not published here and may have been removed by the OS.
The hashes do not establish
deployed application behavior or cover every dependency or OS component.

To reproduce with existing dependencies and an authorized local Chromium:

```sh
PLAYWRIGHT_EXECUTABLE_PATH='/absolute/path/to/chromium' node --input-type=module <<'NODE'
import { chromium } from 'playwright';
import { runRichBrowser } from './benchmarks/conversation-streaming/behavior-only/rich/run-browser.mjs';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
try {
  for (const [presentation, rendererFallback] of [
    ['renderer', false], ['fallback-control', false], ['fallback-control', true],
  ]) {
    const result = await runRichBrowser(browser, { iterations: 1, presentation, rendererFallback });
    console.log(result.build);
  }
} finally { await browser.close(); }
NODE
```
