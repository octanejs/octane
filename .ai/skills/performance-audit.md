# Skill: Octane performance audit

Use this to investigate performance regressions, benchmark results, scheduler/reconciler overhead, compiler output quality, or ecosystem binding perf.

## Read first

- `.ai/project-map.md`
- Benchmark README in the affected `benchmarks/*` directory
- `packages/octane/src/runtime.ts` comments for runtime-level changes
- Existing benchmark scripts in `benchmarks/*/package.json` and `run.mjs`

## Workflow

1. **Define target**
   - Scenario: mount, update, keyed reorder, context, effects, Suspense, hydration, SSR, binding package.
   - Metric: runtime duration, allocations, DOM operations, bundle size, compiler output size, benchmark score.
   - Baseline: current `main`, previous commit, React, Solid/Ripple comparison, or documented expectation.

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

4. **Diagnose**
   - Runtime hot paths: scheduler queues, effect flushing, keyed reconciliation, event delegation, context propagation, refs.
   - Compiler hot paths: unnecessary deopts, over-broad dynamic regions, missed folding, slot churn, repeated closures.
   - Binding hot paths: excessive subscriptions, selector equality failures, layout-effect loops.

5. **Patch or report**
   - Prefer measurable changes with a regression test/benchmark note.
   - Preserve correctness over micro-optimizations.
   - Document tradeoffs and residual risk.

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
```

## Common pitfalls

- jsdom is poor for layout/paint measurements.
- Differential `innerHTML` tests prove correctness, not performance.
- React and Octane may perform different physical DOM move sets while producing identical final DOM.
- Compiler output changes can shift runtime cost; inspect both layers.
