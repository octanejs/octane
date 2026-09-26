# Signal Chat islands-first correctness checkpoint

This is a manually gated experiment on one frozen copy of Signal Chat. It is not an automatic eligibility analysis or a production bootstrap. It asks whether the existing independent islands can operate when the composed default-route root is never hydrated. The production SSR handler, CSS, stream owner, early event capture, document lifecycle and all five original independent activators remain in use. The ordinary control and candidate use the **same emitted build**, with a query parameter selecting the ordinary path before the shared independent registry starts. The `/eager` route also takes the ordinary path.

The generated client entry still statically imports the full renderer, and SSR still preloads the page module. Load-triggered Metrics also uses the normal renderer. This checkpoint does not measure or claim a startup JavaScript saving. It does not remove or rewrite the app's server rendering. The candidate skips the page-module import and composed-root `hydrateRoot` call after island registration, but the authored `preHydrate` hook runs without waiting for the page module first. This changes the possible ordering of their module side effects and is not full instrumentation parity. The hook's shell DOM observation remains, but there is no composed-shell hydration to observe or delay. The unchanged example still displays its “Shell hydration delay” control; in this experiment, `hydrateDelay` can delay the hook's completion but has no shell hydration to delay. The control is therefore misleading for the candidate and would need changing in an actual example integration.

Selection is deliberately narrow: the build refuses a changed example snapshot, the post-transform requires exactly one occurrence of each expected generated entry site, and the runtime checks the specific default route/export, layout and boundary settings, hook, streamed document and shell marker. This gate is a fixture assertion, not proof for arbitrary route code. If the input is ineligible or `__ordinaryRoot` is present in the URL, the original root path is selected before the one shared island registry begins. There is **no lazy fallback after custom activation**, no general recovery for a mismatch or remount, and no proof that an active renderer-free binding island can transfer its keyed regions. The ordinary independent-island-to-parent handoff has separate owning-package coverage; it is not exercised by a later root hydration here.

## Reproduce

Run from the worktree root with its installed dependencies and an authorized local Chromium executable:

```sh
node benchmarks/streamed-shell-prototype/islands-first/build.mjs
PLAYWRIGHT_EXECUTABLE_PATH='/absolute/path/to/authorized/chromium' \
  node benchmarks/streamed-shell-prototype/islands-first/browser.mjs /absolute/output/directory
```

The first command prints a fresh temporary directory. The browser command checks the copied example, selected source/toolchain files, both experiment scripts and every emitted client/server file against the build report before running. Hashes do not cover every installed dependency or the operating system. No installation or application-source modification is performed.

## Observed checkpoint

The historical temporary run named `octane-islands-first-5RUkwE` used Node 26.4.0, Vite 8.1.5 and Chromium 149.0.7827.55. Its example snapshot SHA-256 is `5dd762d9b50a9f933d6a90ede20e52dd0e6d18a603f79f27b8237c514c1d5d0d`; the selected toolchain SHA-256 is `aec368653d232214a9aa510bc4330bc1effb73a57fdc404fae4a66993f2dab9d`. The build report SHA-256 is `f375f14a529497c1ee9224dfe3b5aef9ddab49d6bd0d5646e2d85a6fd558d72e` and the browser report SHA-256 is `d41a42c4ef17e448b05e2c0b4ab94b41fc58e51f02d1b253b6dd525223151e55`. These temporary artifacts are not published with this repository and may have been removed by the operating system.

In both modes the browser checked the real streamed document and original activators. It preserved an early Composer draft, focus, selection and node identity while its activation module was held; received 21 stream frames before Composer activation; caught up to the final answer, history and tools; and observed a later answer revision while its producer was still open. A Send clicked while the retained Composer button's module was held replayed once and started one RPC. A native settings-form navigation reached `/eager` and displayed five requested history rows. The same stylesheet loaded and sampled computed styles matched. Back navigation used BFCache in this run, preserved the Composer node and prior prompt, and allowed another Send after restoration.

The failure control also exposes a limitation of the existing app behavior. A Retry clicked while the Conversation activation module was held targeted a server-rendered error button that activation replaced. The original click did not produce an RPC in either mode; the current stale-target guard does not replay it onto the replacement. Clicking the live replacement then retried successfully. This negative result is retained in the report rather than counted as successful replay.

The browser recorded canceled RPC requests: two in each navigation/return flow and one each in the queued-Send and Retry flows, in both modes. Each answer producer was confirmed open immediately before its document was closed with Composer activation pending; afterward it finalized without completing, and exactly one corresponding server “client disconnected” diagnostic was recorded. No other server diagnostics were accepted. With an `auth=1800` request, the Metrics activation record appeared before the session producer completed in one sample of each mode; this is an ordering observation, not a timing bound.

The browser reports a single run per mode and local Chromium behavior, not latency, production traffic, physical-device evidence or a general proof for future framework changes. It does not test a later switch from the islands-first path to root hydration, arbitrary mismatches, or all possible network and lifecycle interleavings.
