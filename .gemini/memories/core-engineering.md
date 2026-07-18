# Core Framework Engineering Standard

Changes to the runtime, compiler, SSR/hydration engine, scheduler, reconciler,
and framework build pipeline multiply across every Octane application. Treat
performance, correctness, code size, and maintainability as release criteria,
not cleanup work for a later change.

## Establish the contract before editing

- Read the owning source comments, callers, tests, benchmark harness, and the
  documented React parity or Octane divergence. State the consumer-observable
  contract and the invariants that must not move.
- Map every execution mode the change can reach: mount/update/delete, dev/prod,
  client/server, render/hydrate, sync/concurrent, success/error/abort, and
  compiler authoring/output paths. Test only applicable modes, but do not omit a
  mode merely because the first implementation path did not mention it.
- Identify whether the code is on a hot path and estimate frequency and scale.
  Framework fundamentals are presumed performance-sensitive until inspection
  shows otherwise.
- For a bug, first add or identify a behavioral test with a credible pre-fix
  failure. For an optimization, record a relevant baseline before changing the
  implementation. Do not infer speed from shorter source or generated output.

## Protect the performance model

- Keep common paths direct. Avoid new allocations, closures, object-shape
  changes, polymorphic calls, scans, DOM reads/writes, serialization work, or
  scheduling hops per component/render/node unless measurement justifies them.
- Push rare behavior to cold branches and pay for optional features only when
  used. Do not penalize every component to simplify an uncommon case.
- Consider the whole cost transfer: compiler time, generated code, parse and
  load cost, runtime CPU, memory retention, garbage collection, DOM operations,
  SSR throughput, hydration work, and bundle size. Moving cost between layers
  is not automatically an improvement.
- Reuse existing deterministic benchmarks. Compare baseline and candidate with
  the same command, environment, warmup, and iteration policy. Use ratio guards
  or stable operation counters for regression protection; use timing results
  only when the signal exceeds noise.
- Never claim a performance improvement without measurements. If representative
  measurement is impractical, say so, avoid the claim, and document the
  remaining performance risk.

## Implement the smallest durable design

- Prefer fixing the owning abstraction over adding flags or special cases at
  callers. Preserve fast paths and existing data representations unless the
  benefit of changing them is demonstrated.
- Keep invariants explicit near the code that enforces them. Comments explain
  why a non-obvious constraint exists; tests protect observable behavior.
- Do not weaken correctness, diagnostics, accessibility, security, or supported
  semantics for benchmark gains. A faster wrong or incomplete path is a
  regression.
- Avoid speculative generality. New caches, queues, memoization, and retained
  state require an invalidation/lifetime argument and tests for cleanup,
  reentrancy, errors, and aborts where applicable.

## Perform an adversarial self-review

Before handoff, inspect the complete diff as if rejecting another author's
change. At minimum:

1. Try to falsify the solution with empty, large, repeated, nested, reordered,
   reentrant, error, abort, cleanup, and hydration cases that apply.
2. Trace new state and allocations from creation through invalidation and
   release. Look for retained trees, duplicate work, stale closures, and work
   that moved from a cold path to a hot one.
3. Re-read every changed call site and adjacent fast path. Check dev/prod and
   client/server symmetry, generated output, public types, and binding impact.
4. Compare against at least one simpler design. Remove branches, helpers,
   options, and comments that do not earn their ongoing cost.
5. Confirm that tests fail for the intended regression and remain insensitive
   to valid implementation alternatives. Confirm benchmark controls still
   produce the same semantic result.

Resolve issues found during review, then run the review once more on the final
diff. Do not describe work as complete while known correctness or performance
questions remain unreported.

## Evidence required at handoff

- Observable contract and affected hot paths.
- Correctness commands and results, including production/server/hydration
  coverage when applicable.
- Baseline and candidate benchmark commands/results for performance-sensitive
  changes, or an explicit explanation of why no trustworthy measurement exists.
- Self-review findings that materially changed the implementation.
- Residual risks, untested modes, and follow-up work. “All tests pass” is not a
  substitute for this evidence.
