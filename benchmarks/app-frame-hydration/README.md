# App-frame hydration

This headless-Chromium suite hydrates a server-rendered application frame with
the shape of a production app-frame hydration audit. Every module imports
`octane/signals`, so the frame compiles with native reads, runtime `style`
bindings and the document signal owner, and hydration runs with the native
read driver active.

The `frame` scenario creates about 1,650 Blocks on hydration:

- About 1,150 component Blocks, mostly icon, tooltip, button and link wrappers.
- About 430 control-flow Blocks for `@if` arms.
- 74 `@for` rows.

About 270 of its wrappers also forward a `style={props.style}` prop that callers
leave undefined. The audited frame had a Block for each of those bindings. Unset
styles now write without one, so they add no Blocks here.

Its native signal reads sit in leaf components. The `frame-live-sections`
scenario renders the same frame with two section roots, the sidebar and the
composer, reading a signal themselves. Releasing the adopted server values after
the hydration commit then re-renders those whole sections in the same task.

## Operations

- `hydrate_cold`: a fresh browser context per sample, so no JIT state or
  feedback survives. The page loads under a 4× CPU throttle, then the sample
  times `hydrateRoot` plus the work it schedules for the same task.
- `hydrate_warm`: repeated hydrations of the same server HTML in one
  long-lived page, after four warmups, under the same throttle.

Every sample verifies that hydration adopts every server element, raises no
recoverable error, delivers a delegated click that re-renders a native-read
arm, and unmounts cleanly.

## Counters

The run also counts deterministic work for one cold hydration of each scenario.
It uses a separate jitless Chromium, so inlining cannot hide calls from precise
coverage, and a young generation large enough that no scavenge runs mid-sample.
Each row's `meta` records:

- `blocks`: Blocks created.
- `blockRenders`: `renderBlockInner` calls.
- `renderBlockEntries` and `renderBlockEntriesPerRender`.
- Signal-owner calls.
- `productionCalls`: all production calls.
- `heapBytes`: JS heap bytes allocated by hydration.

## Running

```bash
node benchmarks/bench.mjs --quick app-frame-hydration
node benchmarks/app-frame-hydration/run.mjs 20
```

To compare this checkout with another, interleaved round by round in the same
browser:

```bash
node benchmarks/app-frame-hydration/run.mjs 20 --base=../octane-main
```

The base checkout needs its own dependencies or links to these. The fixture and
harness come from this checkout. The base build compiles them with that
checkout's `packages/octane` runtime and compiler and server-renders its own
HTML, and the run notes when the two candidates' HTML differs. Each scenario
then reports the median head/base ratio with a bootstrap 95% interval.
`--throttle=<rate>`, `--warm-reps=<n>` and `--scenarios=<a,b>` adjust the run.
