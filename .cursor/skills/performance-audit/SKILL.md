---
name: performance-audit
description: Audit or defend Octane performance. Use when a change can affect per-render, per-node, compiler-output, SSR, hydration, or bundle cost, or when asked whether something is fast enough.
---
# Skill: Octane performance audit

Use this to investigate performance regressions, benchmark results, scheduler/reconciler overhead, compiler output quality, or ecosystem binding perf.

## Read first

- Benchmark README in the affected `benchmarks/*` directory
- `packages/octane/src/runtime.ts` comments for runtime-level changes
- Existing benchmark scripts in `benchmarks/*/package.json` and `run.mjs`

## Workflow

1. **Define target**
   - Scenario: mount, update, keyed reorder, context, effects, Suspense, hydration, SSR, binding package.
   - Metric: runtime duration, allocations, DOM operations, bundle size, compiler output size, benchmark score.
   - Baseline: current `main`, previous commit, React, Solid/Ripple comparison, or documented expectation.
   - Semantic control: the output, identity, ordering, or lifecycle result that
     proves both candidates perform the same work.

2. **Choose harness**
   - Existing benchmarks: `benchmarks/news`, `js-framework`, `recursive-context`, `signal-favoring`, `dbmon`.
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

## Report template

```md
## Performance audit
- Target: ...
- Baseline command/result: ...
- Candidate command/result: ...
- Delta: ...

## Findings
- ...

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
- Differential `innerHTML` tests prove correctness, not performance.
- React and Octane may perform different physical DOM move sets while producing identical final DOM.
- Compiler output changes can shift runtime cost; inspect both layers.
