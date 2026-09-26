# Signal Chat islands-first delivery checkpoint

This fixture-specific experiment builds the unchanged Signal Chat example with all five original independent island activators. Its manually selected default route skips the composed-root hydration and page import, as in the [correctness checkpoint](../islands-first/README.md). This version also moves the root-only APIs to a lazy fallback module and removes the default route's page preload. The normal Metrics island still activates on `load()` and requests the renderer. This is a small delivery experiment, not an automatic eligibility proof or a production implementation.

Both arms use one client build and one benchmark-modified generated server. The builder patches only the disposable server bundle's local per-request `assetHead` after the existing cached head is prepared. For the pinned default App route it removes one asserted manifest-derived page preload; the forced ordinary route and `/eager` retain it. The original stream composition, CSS, cancellation and backpressure code are untouched. The server cannot inspect the client's eventual DOM eligibility, so a client guard failure may choose the ordinary path after this preload was omitted; that path can still import the page. The original and patched server hashes are recorded below.

The early event capture uses `octane/hydration`; an explicit ordinary selection loads a small fallback facade before starting the shared independent registry. There is still no mechanism to switch to ordinary root hydration after island activation, or to establish safe general remount and mismatch recovery. The candidate also runs the authored `preHydrate` hook without first importing the page. Its shell hydration delay is therefore no longer a shell hydration delay. Those ordering and instrumentation differences are not full parity.

## Observed delivery

One local Chromium 149.0.7827.55 sample per arm used fresh browser contexts, blocked service workers, the same production Node server and the 20-turn / 10-history-row workload. The snapshot was taken after Metrics activation and network idle, before user interaction; the second snapshot follows Conversation activation. Response sizes are browser-reported encoded bodies, excluding headers. Most JS and the CSS were gzip-encoded; the 140-byte fallback facade and 316-byte pre-hydrate module were uncompressed. These are payload observations, not latency measurements.

| Route | Startup JS requests | Startup JS bodies | After Conversation activation |
| --- | ---: | ---: | ---: |
| Candidate default | 13 | 146,128 B | 14 requests / 148,617 B |
| Forced ordinary default | 15 | 149,485 B | 16 requests / 151,974 B |
| `/eager`, ordinary | 18 | 154,832 B | Not sampled separately |

The same-build difference is **3,357 B** at startup (about 2.2%). It consists of the page request, 3,217 B encoded in this run, and the 140 B ordinary fallback facade. That facade is an extra cost of this benchmark's lazy ordinary path. This is not a matched comparison with the unmodified production bootstrap, and a single localhost run is not evidence of a material application-level performance win. Both default arms requested the same 92,933 B encoded renderer through Metrics. The page preload and page request were absent only for the candidate; both were present for ordinary and `/eager`.

For the initial requests, candidate / ordinary / eager document bodies were 107,992 / 108,066 / 108,001 B without content encoding, and each requested the same 2,248 B gzip CSS file. All initial response bodies including document and CSS totaled 256,368 / 259,799 / 265,081 B; corresponding response headers totaled 3,974 / 4,472 / 5,300 B. The server and browser records use different document URLs and streamed request identities, so document sizes are observations rather than a controlled HTML delta.

The emitted hydration entry's static closure is four JS files totaling 28,999 raw / 10,746 gzip-9 bytes and excludes the renderer. The complete reachable graph, including all dynamic islands, the ordinary page and fallback, is 19 JS files totaling 484,421 raw / 155,337 gzip-9 bytes. These are sums of independently compressed files, not the browser's startup transfer.

## Behavior checked

The existing paired Chromium correctness driver passed for the candidate and forced ordinary branch against this same build. It checked one independent registry and zero versus one composed-root hydration calls, 21 frames received before Composer activation, draft/focus/selection and DOM identity, one replayed early Send, continuing streamed values, stylesheet and computed CSS, ordinary `/eager` navigation, a BFCache restoration and a subsequent Send. It also exercised failure and Retry. An early Retry against an SSR target that was replaced during activation did not replay in either branch; an explicit later Retry succeeded. Each mode recorded four canceled RPC requests. In each deliberate close the answer producer was confirmed open, then finalized without completing; one corresponding server `client disconnected` diagnostic was recorded and no other server diagnostics were accepted. The test is bounded to these cases, not all application behavior.

## Evidence and reproduction

The historical temporary evidence directory was named `octane-islands-delivery-0UKInc`; it is not published with this repository. The selected source SHA-256 is `5dd762d9b50a9f933d6a90ede20e52dd0e6d18a603f79f27b8237c514c1d5d0d`; selected toolchain SHA-256 is `aec368653d232214a9aa510bc4330bc1effb73a57fdc404fae4a66993f2dab9d`. The original generated server SHA-256 is `afe6d03c5546031f243e0500242e3bfe000bc171bd9ae00a1316c025bab5280c`, and the patched server SHA-256 is `a242a7d0c22fd46f609e7eb72981f2c04d09f94799c083c8b05c4cfc30babf8b`. The build, delivery and correctness report SHA-256 values are `4ad8aeec6600180abb3262b3e027707904aa5ca9a05c877ba059eadcefa6a52a`, `62a03ae68b6e9d5616152ead50f3182f0cec4adf765b10a54462020533cdf119` and `0dc2372a66549cddd5a7ad2d84a0013ad239cc75d41bace62244b65b40abd280` respectively. The hashes cover selected source, toolchain, scripts and all emitted files, not every installed dependency or OS component.

From this worktree with the existing lockfile-matched dependencies:

```sh
node benchmarks/streamed-shell-prototype/islands-first-delivery/build.mjs
PLAYWRIGHT_EXECUTABLE_PATH='/absolute/path/to/authorized/chromium' \
  node benchmarks/streamed-shell-prototype/islands-first-delivery/measure.mjs /absolute/output/from/build
PLAYWRIGHT_EXECUTABLE_PATH='/absolute/path/to/authorized/chromium' \
  node benchmarks/streamed-shell-prototype/islands-first/browser.mjs /absolute/output/from/build
```

The builder pins the example snapshot, requires exactly one generated bootstrap and server head site, records both experiment scripts and the reused correctness driver, and hashes emitted artifacts. The measurement verifies those inputs before using fresh contexts; the correctness driver separately checks its own inputs and emitted files. Neither runner overwrites its report.
