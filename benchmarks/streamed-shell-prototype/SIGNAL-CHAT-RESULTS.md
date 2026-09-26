# Signal Chat production route: automatic-shell fallback

This checkpoint predates the framed-root hydration recovery fix. The refreshed
unchanged-route measurements are in [the renderer size investigation](runtime-size/README.md);
the automatic-shell candidate below remains a historical rejection test.

The current automatic-shell prototype rejects the real `App.tsrx` as `unsupported-source`. Its fallback leaves normal Octane compilation in place, so this experiment does **not** demonstrate a JavaScript saving on Signal Chat. Baseline, repeated baseline (`control`), and rejected candidate (`fallback`) all retained the five independent hydration entries and the stylesheet. The result is a check of fallback behavior and repeat-build variation, not a measurement of a working shell optimization.

The builds used the same frozen copy of the updated example and include the streamed-signal teardown fix. The recorded source snapshot SHA-256 is `5dd762d9b50a9f933d6a90ede20e52dd0e6d18a603f79f27b8237c514c1d5d0d`; the selected toolchain SHA-256 is `eb99c7ff8d606f929de4a9c78684b0b975dc91c8ed985f7ab434beb722c4df7f`. Both matched the workspace after the run. The hashes cover the copied example, selected framework and benchmark sources, the experimental plugin, and lockfile; they do not cover every installed dependency or OS component. The reports also bind the generated server and client files, client manifest, metadata, and browser driver. The historical temporary evidence directory was named `octane-signal-chat-route-bGN4uJ`; it is not published with this repository and may have been removed by the OS.

| Build | All reachable JS, raw | All reachable JS, offline gzip-9 | Static entry JS, gzip-9 | Dynamic reachable JS, gzip-9 | CSS, gzip-9 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 483,092 B | 154,797 B | 107,452 B | 47,345 B | 2,229 B |
| Control | 483,092 B | 154,797 B | 107,452 B | 47,345 B | 2,229 B |
| Fallback | 483,092 B | 154,795 B | 107,450 B | 47,345 B | 2,229 B |

These gzip figures sum separately compressed files from the captured Vite graph. All emitted client JS was accounted for. The two-byte difference in the fallback is not a demonstrated shell saving: the transform was rejected.

On local Chromium 149.0.7827.55, fresh contexts and two samples per profile/scenario produced these startup observations. The browser-observed JS body sizes are encoded response sizes reported by Chromium; the stylesheet was another 2,248 B in each case. The totals below include the page-observed document, stylesheet and JS response bodies and headers. Chromium's page observer missed an automatic favicon request; the reports separately record all responses observed by the Node server, including that 404. These are localhost observations, not physical-network byte or latency measurements.

| Route and profile | JS requests / encoded bodies | All page-observed bodies + headers | Identity-encoded document body | Inline stream-script elements |
| --- | ---: | ---: | ---: | ---: |
| Interaction, 20 turns / 10 history rows | 14 / 148,942 B | 263,530 B | 107,856 B | 96,381 B |
| Eager, 20 / 10 | 17 / 154,287 B | 269,655 B | 107,808 B | 96,381 B |
| Interaction, 200 / 60 | 14 / 148,942 B | 702,347 B | 546,664 B | 535,188 B |
| Eager, 200 / 60 | 17 / 154,287 B | 708,472 B | 546,616 B | 535,188 B |

The table shows baseline; control matched and fallback request totals were two bytes smaller in those cases. The document sizes come from a separate identity-encoded HTTP capture, and the stream-script measurement counts matching inline elements, not protocol frames. Each successful document contained 21 signal-receive calls. Offline gzip-9 of the baseline interaction documents was approximately 9.9 KB and 30.8 KB respectively; the measured document responses were not gzip encoded. The static adapter did gzip most JS and CSS. Delayed hydration and failure-before-first-answer were also measured in the report.

The browser checks held external scripts until the browser had received the complete streamed document, then verified adoption retained a prior transcript node, textarea value, focus and selection; the independent panels caught up and sending a message succeeded. A separate slow-stream case activated the conversation while its producer was still open, observed revision 2 before completion, and reached revision 4 with the tracked nodes retained. Retry after the planned failure and native form submission with two turns and five history rows succeeded. One `net::ERR_ABORTED` RPC was recorded during each send and retry; the report preserves those cancellations, so the run is not evidence that every request succeeded. This does not prove same-root remount, hydration mismatch recovery, BFCache behavior, or physical-device performance.

To reproduce from the worktree root with its existing dependencies:

```sh
node benchmarks/streamed-shell-prototype/signal-chat-route/prepare.mjs
PLAYWRIGHT_EXECUTABLE_PATH='/absolute/path/to/authorized/chromium' \
  node benchmarks/streamed-shell-prototype/signal-chat-route/browser.mjs \
  --build-dir=/absolute/path/printed/by/prepare --samples=2
```

On this host the already-installed Playwright Chromium required an escalated launch because the local sandbox prevented browser startup. The route runner uses the actual generated production handler and Node static adapter, a loopback HTTP wrapper, and no service worker. Its few timed localhost samples are observations rather than a performance benchmark. A hydration-only surrogate still needs a correct normal-mount/remount and mismatch-recovery fallback; even adoption can retry through normal rendering. The extra-wrapper counterfactual therefore cannot establish savings for the existing App shell.
