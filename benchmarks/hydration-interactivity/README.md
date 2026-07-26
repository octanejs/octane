# Hydration interactivity benchmark

A production-built, six-framework comparison of what users can actually do with
server-rendered HTML while client-side hydration is still blocked. Playwright
types into a real Chromium search input, clicks Send before the hydration chunk
is released, and verifies DOM adoption, preserved text, focus, caret position,
live component state, event replay, and whether the exact search query was
actually delivered exactly once.

| target | production renderer |
| --- | --- |
| `octane-tsrx` | Octane SSR, compiler-owned hydration, and the public lightweight early-capture bootstrap |
| `react` | React 19 `react-dom/server`, `react-dom/client`, and real Suspense-boundary event replay |
| `preact` | native Preact, `preact-render-to-string`, and `preact/compat` flushing |
| `solid` | Solid 2.0 beta, `@solidjs/web`, and the real Solid hydration script |
| `svelte` | Svelte 5 server rendering, runes, and strict public hydration |
| `vue-vapor` | Vue 3.6 Vapor, the existing Vapor-inclusive client shim, and server-rendered Vapor SFCs |

All six apps render the same 180 server-rendered articles and the same editor,
button, visible component-state outputs, and native `input` handler. The
benchmark reuses each target's established production `benchmarks/news`
toolchain without modifying the existing news workload or adding dependencies.

## Operations

Each sample uses a fresh browser context. The harness intercepts the production
`hydration-client` chunk, waits for the small bootstrap to run, and keeps the
chunk blocked while Playwright performs real keyboard or mouse input. It never
manufactures user typing with `dispatchEvent`, injects an event-replay shim, or
uses a sleep as a hydration gate.

- `uncontrolled_1x_*`: type a complete draft into the server-rendered native
  input before hydration under normal CPU speed.
- `uncontrolled_6x_*`: repeat the same workload after applying a real 6× CPU
  slowdown through Chromium's `Emulation.setCPUThrottlingRate` command.
- `controlled_6x_*`: repeat under the same 6× slowdown with each framework's
  controlled input path; report whether pre-hydration text, focus, and caret
  survive adoption and verify that the next genuine edit updates visible
  component state. Octane must preserve all three; reference-framework behavior
  is measured and reported rather than replaced with a compatibility shim.
- `interaction_6x_*`: click the server-rendered button while the production
  hydration chunk is blocked. Octane's public `interaction()` boundary and
  `initializeHydrationEventCapture()` must replay the click exactly once after
  hydration. Solid 2.0's real server hydration script must also replay the click
  exactly once. React installs its actual `hydrateRoot` listeners before the
  click, leaves a server-rendered Suspense boundary dehydrated until the blocked
  component chunk arrives, and must replay the native focus event from that
  exact same user interaction. React 19 cannot replay the blocked discrete click
  after its lazy component has resolved, so focus and click replay are reported
  separately rather than incorrectly crediting React with pre-root capture or
  deferred click replay. The remaining frameworks use their real pre-root
  behavior without a synthetic early-capture shim. Every target must process
  the next real post-hydration click exactly once.
- `search_send_6x_*`: type a real search query into the controlled, still
  server-rendered search box, click Send before its hydration chunk is
  released, and report whether hydration preserves the query, replays the
  discrete click, and submits the exact original query exactly once. Missing
  replay, overwritten query text, and an incorrect submitted value are recorded
  explicitly as user-experience correctness failures; Octane fails the suite
  if it loses the query or Send intent.

The unified runner prints a six-framework UX correctness table after the
timings. Each framework receives an explicit `PASS` or `FAIL`, together with
the measured fractions of replayed Send clicks, preserved search queries, and
exactly-once deliveries. A replayed focus does not turn a dropped Send into a
success, and a replayed Send does not pass if it submits an overwritten query.
The machine-readable `meta.userExperience` result additionally records the
counts of dropped clicks, lost searches, incorrect submissions, focus-only
replays, and the exact correctness issues. Reference-framework failures remain
visible comparison results; Octane's UX correctness remains a hard suite gate.

The typing operations separately report first-character latency, the time to
type the complete draft, chunk-release-to-hydration latency, synchronous
hydration work, and post-hydration typing latency. The replay operations report
chunk-release-to-hydration and interaction-to-hydration latency; replay counts
are recorded as deterministic target metadata.

## Correctness gates

A timing is accepted only if the harness proves all of the following:

- the hydration client really was withheld throughout the pre-hydration
  interaction;
- Chromium generated one native input event for every typed character;
- the original server-rendered input, article, and interaction button were
  adopted rather than rebuilt;
- whether each framework preserved the typed draft, focus, and caret; loss of
  any of the three fails Octane and is reported honestly for reference targets;
- the first post-hydration edit preserved the original draft and updated the
  visible application state;
- the page contains exactly 180 correctly adopted article cards;
- hydration completes exactly once without browser or hydration errors;
- typing a search and clicking Send before hydration either delivers the exact
  original query once or appears explicitly as a replay correctness issue;
- Octane and Solid 2.0 replay the deferred pre-root click exactly once, React
  replays the associated focus event exactly once through its genuine
  dehydrated boundary, and remaining targets are not credited with unsupported
  replay behavior; and
- every target handles the next actual click exactly once.

A failed gate writes a `failed` result and exits nonzero, matching the unified
benchmark runner's existing `BENCH_JSON` contract. Timing guards should be
calibrated from paired production runs on the same machine; CPU throttling is
not an absolute cross-machine performance threshold.

## Run

```bash
node benchmarks/bench.mjs hydration-interactivity
node benchmarks/bench.mjs --quick hydration-interactivity

node benchmarks/hydration-interactivity/run.mjs octane-tsrx 5
node benchmarks/hydration-interactivity/run.mjs react 5
node benchmarks/hydration-interactivity/run.mjs preact 5
node benchmarks/hydration-interactivity/run.mjs solid 5
node benchmarks/hydration-interactivity/run.mjs svelte 5
node benchmarks/hydration-interactivity/run.mjs vue-vapor 5
```

Pass `--no-build` after an initial run to reuse the existing production assets.
