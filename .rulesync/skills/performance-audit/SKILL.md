---
targets: ['*']
name: performance-audit
description: Audit or defend Octane performance. Use when a change can affect per-render, per-node, scheduling, compiler-output, SSR, hydration, or bundle cost, or when asked whether something is fast enough. Holds the V8-shape, DOM, and scheduling rules hot-path code must follow.
---

# Skill: Octane performance audit

Use this to investigate performance regressions, benchmark results, scheduler/reconciler overhead, compiler output quality, or ecosystem binding perf.

## Read first

- Benchmark README in the affected `benchmarks/*` directory
- `packages/octane/src/runtime.ts` comments for runtime-level changes
- Existing benchmark scripts in `benchmarks/*/package.json` and `run.mjs`
- The discipline reference for each dimension the change touches:
  [V8 shapes and allocation](references/v8-shapes.md),
  [DOM work](references/dom-work.md), and
  [scheduling](references/scheduling.md)

## Hot-path discipline

These rules apply to code that runs per render, node, item, event, signal
notification, or server request. Each reference cites the runtime code that
already follows the rule.

- **Shapes:** allocate hot records from one constructor or one literal site with
  every field present, in a fixed order, as `BlockImpl` and the `bagN` factories
  do. No `delete`, conditional keys, runtime class fields on hot classes, or
  per-instance freezing. Keep call sites and return shapes monomorphic, numeric
  fields integral, and arrays packed. Do not allocate closures, literals, rest
  arrays, or iterators per item.
- **Reachability:** never name a heavy function from a hot compiled path. Put
  feature-only code behind the capability or driver that owns it.
- **DOM:** read geometry before writing, never in the render walk, and never
  interleaved with writes in a loop. Insert built subtrees once. Keep events
  native and delegated. Write from resize callbacks only through
  `createResizeObserver`.
- **Scheduling:** a microtask, `await` of a settled value, or
  `requestAnimationFrame` is not a yield. Do not add a render or commit per
  microtask hop. Coalesce first, then yield by posting a task through an existing
  poster. Leave the documented scheduler contract to issue #1864.

Run the `perf-review` skill on the diff before handoff. It applies these rules
to the change and lists the evidence each finding needs.

## Workflow

1. **Define target**
   - Scenario: mount, update, keyed reorder, context, effects, Suspense, hydration, SSR, binding package.
   - Metric: runtime duration, allocations, DOM operations, bundle size, compiler output size, benchmark score.
   - Baseline: current `main`, previous commit, React, Solid/Ripple comparison, or documented expectation.
   - Semantic control: the output, identity, ordering, or lifecycle result that
     proves both candidates perform the same work.

2. **Choose harness**
   - Existing benchmarks: `node benchmarks/bench.mjs --list` names every suite.
     Common ones are `js-framework`, `dbmon`, `news`, `recursive-context`,
     `signal-favoring`, and `todomvc`.
   - Object shapes: `benchmarks/runtime-object-shapes` gates one map per record
     family with `%HaveSameMap`. Tier and deopt traces:
     `benchmarks/client-hot-paths/functions.mjs`.
   - Scheduling: `scheduler-responsiveness`, `passive-scheduling`,
     `effect-scheduling`, and the marker-task commit count in
     [scheduling](references/scheduling.md).
   - Micro regression: focused Vitest with counters/logging.
   - Compiler output: inspect emitted JS from `compile.js`/Vite transform.
   - Browser-only perf: use Playwright or benchmark harness if available.

3. **Run baseline and candidate**
   - Warm up.
   - Run multiple iterations.
   - Record environment and command.
   - Avoid mixing dependency install/build changes with code changes.
   - Use the same commit inputs, runner options, and machine state. Do not compare
     a quick smoke result with a full result.
   - Treat a delta inside observed variance as inconclusive. Prefer ratio guards
     and deterministic counters when wall-clock noise is larger than the claim.
   - The pull request benchmark gates js-framework production calls and DOM
     mutations per operation against the merge commit's first parent: any
     increase fails it. Wall time there is a paired report, called slower or
     faster only when its 95% interval lies beyond ±3%.

4. **Diagnose**
   - Runtime hot paths: scheduler queues, effect flushing, keyed reconciliation, event delegation, context propagation, refs.
   - Compiler hot paths: unnecessary deopts, over-broad dynamic regions, missed folding, slot churn, repeated closures.
   - Binding hot paths: excessive subscriptions, selector equality failures, layout-effect loops.

5. **Patch or report**
   - Prefer measurable changes with a regression test/benchmark note.
   - Preserve correctness over micro-optimizations.
   - Document tradeoffs and residual risk.

6. **Challenge the conclusion**
   - Inspect whether work was shifted to startup, compilation, hydration,
     garbage collection, or a less visible branch rather than removed.
   - Check allocation lifetime and invalidation for new caches or memoization.
   - Attempt a workload that should make the proposed improvement disappear; if
     it does not, look for a harness or measurement error.
   - Re-run the final candidate after self-review changes. Never report a stale
     intermediate measurement as the final result.

## Size budgets and the pull request gates

- Every byte budget in `benchmarks/bundle-size/` (`minimal-budgets.json`,
  `app-budgets.json`, `jsx-budgets.json`) is the measured production bytes plus
  32 for raw and gzip, and CI enforces all of them. Brotli gets 256 because it
  can grow when code is removed; judge growth by raw and gzip. Check a change with
  `node benchmarks/bundle-size/run-minimal.mjs --budgets` and
  `node benchmarks/bundle-size/run.mjs --budgets octane-tsrx octane-jsx`; pass
  scenario or target names to narrow a run while iterating.
- Never raise a budget in a feature or fix pull request, including to absorb your
  own growth. Shrink the change, typically by moving hydration-only or
  feature-only code behind the capability that owns it, or ask for a separate
  budget pull request that changes only budget files and prose and names the
  bytes and the reason. `benchmarks/bundle-size/budget-raises.mjs` fails CI on a
  raise that travels with other changes.
- When a change saves bytes, lower the budget in the same pull request with
  `--write-budgets` for the scenarios it improved, and report the delta.

## Evidence required for hot-path changes

| Change | Evidence |
| --- | --- |
| Any runtime, compiler-output, or binding hot path | The pull request benchmark report (`.github/workflows/pr-bench.yml`): bytes against committed budgets, and js-framework production calls and DOM mutations per operation, where any increase fails. |
| Bundle bytes | `node benchmarks/bundle-size/run-minimal.mjs --budgets <scenario>` and `run.mjs --budgets octane-tsrx octane-jsx` while iterating. CI's report rows are authoritative: brotli, and occasionally gzip or raw for path-dependent scenarios, can differ locally. |
| A hot record's shape | `%HaveSameMap` across every construction mode, as `benchmarks/runtime-object-shapes` does, and `perf-review-scan` clean. |
| Allocation or tiering | A scratch harness on the production bundle: pinned semi-space for bytes per call, `%GetOptimizationStatus` and `--trace-deopt` for tiers. |
| Scheduling, commits, or effect timing | The marker-task commit count from [scheduling](references/scheduling.md), plus the relevant scheduling suite. |
| User-visible latency claims | Event Timing in Chromium, maximum duration per `interactionId`, against React on the same app. Long-task entries are not evidence. |
| Optimization claims in general | `node benchmarks/bench.mjs <suite> --ratios` for the suite that owns the scenario. |

Run locally only the suite or scratch probe that owns the scenario, one suite at
a time (`--quick` while iterating). Leave wide runs to CI: the full `pnpm test`,
the full benchmark sweep, and end-to-end or browser suites. Parallel agent
sessions share one machine, and a wide local run makes every timing on it
noise.

## Report template

```md
## Performance audit
- Target: ...
- Baseline command/result: ...
- Candidate command/result: ...
- Delta: ...

## Findings
- ...
- `perf-review` result: ...

## Recommendation
- ...

## Validation
- ...

## Confidence and residual risk
- Noise/variance: ...
- Modes not measured: ...
- Alternative explanation considered: ...
```

## Common pitfalls

- jsdom is poor for layout/paint measurements.
- A microtask-level change can look free in a benchmark that awaits each
  operation, and still add a commit per hop under a burst. Count commits before
  a marker task.
- V8 trace flags piped to a busy parent lose records. Write traces to a file.
- Differential `innerHTML` tests prove correctness, not performance.
- React and Octane may perform different physical DOM move sets while producing identical final DOM.
- Compiler output changes can shift runtime cost; inspect both layers.
