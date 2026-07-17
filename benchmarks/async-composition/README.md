# async-composition

Measures a dashboard-shaped Suspense tree instead of the recursive happy path
in `async-waterfall`. The Octane and React fixtures perform the same eight
versioned requests under one route-level boundary:

```text
Dashboard
├─ ProjectHeader
│  ├─ useProjectBundle() → project, then independent viewer
│  ├─ ProjectBadge       → badge
│  └─ ProjectOwner       → owner (truly depends on project.ownerId)
├─ ActivityPanel         → activity
│  └─ ActivitySummary    → activity-summary
└─ InsightsPanel         → insights
   └─ InsightsChart      → insights-chart
```

This deliberately combines three common React-shaped composition patterns:

- multiple adjacent async components under one Suspense boundary;
- direct async child components in separate component branches;
- two independent `use()` reads hidden inside an imported custom hook.

Seven requests are independent. Only `owner` needs a value returned by
`project`, so an ideal implementation starts seven requests in wave 0 and the
owner request in wave 1. With `DELAY=50ms`, the honest network floor is two
waves / 100ms, not one.

## Targets and operations

- `octane-tsrx` compiles the shared Octane source with the always-on
  waterfall-elimination pipeline.
- `react` is the equivalent React 19 application.

`init` measures a cold mount. `update` performs a transition-wrapped version
bump on the same page, requires the initial fallback to stay hidden, and records
any observed mixed old/new dashboard signatures while the transition is pending.
`init_waves` / `update_waves` are the fetch round count and are the structural
optimization signal used by the ratio gate. `init_calls` / `update_calls`
protect compiler memoization, and `update_mixed_states` exposes mixed-version
transition states as a first-class benchmark operation.
`init_start_span` / `update_start_span` measure the time between the first and
last **independent** request starts. Each result also records the exact request
wave topology, first-wave count, request count, and render-time resource-call
count under `meta`. Transition mixed-state counts and signatures are also
recorded there for direct before/after diagnosis.

The fake network batches every request discovered before the current 50ms timer
settles into one request wave; that window leaves scheduling headroom on slow CI
workers. The exact topology is diagnostic telemetry and fewer waves are an
optimization improvement. The hard gate requires all eight versioned resources
exactly once, the complete rendered signature, initial resource-value retention,
and owner-after-project dependency ordering. It also enforces one-way Octane
ceilings of two waves and eight resource calls for each operation, requires all
seven independent resources in Octane's first wave, and allows no more than one
monotonic mixed-version update state. A new owner may never render against the
previous project, and React must retain its zero-mixed-state control. After first
reaching the final signature, each target must remain stable for one network-
latency window plus two animation frames. The transition must never expose the
initial fallback. A fast or transient result produced by missing work fails the
harness.

## Running

```bash
node benchmarks/bench.mjs async-composition
node benchmarks/bench.mjs --quick async-composition
```

The unified runner production-builds and boots both fixtures. It writes
machine-readable output to `benchmarks/results/async-composition.json`.

## Initial result (2026-07-16)

The recorded 10-sample production run found a real gap rather than another
parallel-floor win:

| target | init | update | waves (init / update) | calls (init / update) | observed mixed update states |
| --- | ---: | ---: | ---: | ---: | ---: |
| octane-tsrx | 312.9ms | 309.6ms | 6 / 6 | 23 / 23 | 6 |
| React | 309.7ms | 154.1ms | 6 / 3 | 35 / 25 | 0 |

Octane does successfully warm each direct async child (`activity-summary` and
`insights-chart`), while the remaining independent work is still discovered serially:

```text
project → viewer → badge → owner → activity+activity-summary → insights+insights-chart
```

The trace points at two compiler coverage gaps: the imported custom hook is
opaque (`project` and independent `viewer` serialize), and the `Dashboard`
warm plan for adjacent panels has no trigger because that parent has no direct
`use()` batch. React's transition retry prewarms the three adjacent panels and
their nested children in three waves, making its update roughly twice as fast
in this workload. Ratio guards compare the structural Octane wave count with
React and should be tightened toward the two-wave floor as those gaps are fixed.

The full-transition observer also found that Octane progressively exposes
resolved v1 resources in the v0 dashboard while the boundary is still pending:
every recorded update produced six distinct mixed-version states. React
recorded zero and held v0 intact until its final state. The benchmark rejects
any increase, invalid intermediate structure, or value rollback while allowing
that known ceiling to improve toward zero. It also publishes the signatures
under `meta.update` so a future transition fix has a direct before/after oracle.

## Optimized result (2026-07-17)

The compiler/runtime follow-up closes both composition gaps. Plain TypeScript
custom hooks now receive the same memoize-and-batch treatment as component-local
`use()` calls, and child warm plans register with active ancestors so the first
suspending descendant can start adjacent branches from a shared, collision-safe
cache.

The recorded production run reaches the workload's true dependency floor:

| target | init | update | waves (init / update) | calls (init / update) | observed mixed update states |
| --- | ---: | ---: | ---: | ---: | ---: |
| octane-tsrx | 105.4ms | 103.5ms | 2 / 2 | 8 / 8 | 1 |
| React | 310.7ms | 154.6ms | 6 / 3 | 35 / 25 | 0 |

```text
project+viewer+badge+activity+activity-summary+insights+insights-chart → owner
```

Every independent request starts before the first 50ms network wave settles;
`owner` alone waits for `project.ownerId`. The remaining single mixed update
signature is transition atomicity work rather than an async-discovery waterfall,
and stays visible under its tightened one-state ceiling.
