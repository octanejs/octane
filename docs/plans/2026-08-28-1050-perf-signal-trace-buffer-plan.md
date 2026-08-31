---
title: Bounded Signal Trace Buffer - Plan
type: perf
date: 2026-08-28
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Bounded Signal Trace Buffer - Plan

## Goal Capsule

- **Objective:** Developers can inspect long-lived scoped signals with the supported large debug trace budgets without tracing work growing with every retained event.
- **Means:** Replace front-removal of retained trace events with bounded slot replacement and reconstruct chronological order only during inspection (KTD1, KTD2).
- **Authority:** The user request and observable `octane/signals` inspection behavior outrank implementation convenience. The core engineering standard governs performance evidence and correctness.
- **Execution profile:** Make one measured, behavior-preserving core optimization from the latest upstream `main`. Abandon the attempt if the baseline does not reproduce the expected scaling cost or if the candidate cannot beat it without moving cost onto the disabled or unfilled control paths.
- **Stop conditions:** Stop this target if chronological history, retirement events, trace isolation, or the supported trace-limit contract cannot be preserved. Remove abandoned-attempt code before evaluating another non-overlapping performance target.
- **Tail ownership:** LFG owns review, verification, changeset, commit, PR creation, and CI follow-through.

---

## Product Contract

### Summary

Keep bounded signal debugging useful under sustained activity by making trace retention constant-time after the buffer fills. Preserve the existing inspection shape, ordering, privacy, and opt-in behavior.

### Problem Frame

`ScopeImpl.trace` currently calls `Array.prototype.shift()` whenever its bounded event array reaches `traceLimit`. A scope using the supported 10,000-event limit therefore moves 9,999 retained records for every later event. This cost is unrelated to signal graph work and becomes dominant precisely when a developer enables a large trace to diagnose a busy scope.

The tracing API was added in the scoped-signals work on 2026-08-27. A search of the author's recent and open Octane performance PRs found no trace-buffer or signal-inspection optimization, so this target does not overlap that work.

### Requirements

**Trace behavior**

- R1. Disabled tracing must continue to retain no events and must return an empty trace from `inspect()`.
- R2. Enabled tracing must retain at most `traceLimit` events and expose the latest events in ascending sequence order after any number of wraps.
- R3. Trace records returned by `inspect()` must remain detached copies that a consumer cannot use to mutate retained history.
- R4. Scope disposal must continue to record retirement in sequence when tracing is enabled, including when that event overwrites a full buffer.

**Performance evidence**

- R5. The full-buffer write path must perform bounded work per trace event rather than work proportional to `traceLimit`.
- R6. A focused benchmark must record comparable unfilled and wrapped controls, validate exact retained sequences, and show a material candidate improvement at the maximum supported trace limit.
- R7. The optimization must not materially regress tracing before the buffer fills or change the zero-limit path.

**Delivery**

- R8. The `octane` package must receive a patch changeset that describes the bounded trace-retention improvement without claiming unsupported application-wide gains.

### Success Criteria

- The maximum-limit wrapped benchmark shows a clear improvement over its pre-change baseline in repeated same-environment runs.
- A conservative same-run ratio guard distinguishes the bounded candidate from the previous full-array shift while leaving noise headroom.
- Focused signal inspection tests, Octane typechecking, formatting, and the relevant benchmark gates pass.

### Scope Boundaries

- Preserve the public `ScopeInspection` and `SignalTraceEvent` shapes. Do not add a new public tracing API.
- Do not optimize unrelated queues, schedulers, compiler paths, bindings, or renderer work in this diff.
- Do not overlap the recent performance PRs for Ink cursor updates, compiler analysis and caching, Floating UI navigation, Radix collection order, Visx categorical scales, Lynx transport or retirement, router dispatch, scheduler depth, form diagnostics, hydration templates, behavior events, or host-property sorting.

#### Deferred to Follow-Up Work

- If measurement disproves this target, discard its code and benchmark-specific guard before evaluating the next independent lead. The coalesced Waypoint callback queue is the first bounded fallback because its drain currently removes callbacks from the array front.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Derive the overwrite slot from the existing trace sequence.** Once the array reaches `traceLimit`, replace the oldest slot using the monotonic sequence instead of shifting the array. This avoids a new per-scope cursor field and keeps the disabled scope shape unchanged.
- KTD2. **Move chronological reconstruction to inspection.** Keep the write path direct and rotate the bounded slots only when `inspect()` creates its already-required detached output. Inspection is the cold consumer boundary and must still return ascending sequence order per R2.
- KTD3. **Measure the production owner and exact history contract.** Extend the scoped-signals benchmark surface with a focused Node-only trace workload that uses the owning implementation, verifies length and sequence after wrapping, alternates sample order, and reports normalized timings for unfilled and wrapped cases.
- KTD4. **Set guards from observed evidence.** Record the unchanged baseline before implementation, rerun the same harness after implementation, and add a ratio ceiling only after both distributions show enough separation to leave broad noise headroom.

### Assumptions

- `ScopeImpl.sequence` increments exactly once for each retained trace event, so it can determine both the replacement slot and the oldest retained slot without separate mutable state.
- `inspect()` is colder than `trace()` and already allocates detached records, so bounded chronological reconstruction there is the appropriate cost transfer.
- The current checkout is clean and based on fetched `origin/main` at `957b91046b31284acdca3064aaac8731b988114b`; a separate worktree is unnecessary unless branch creation or concurrent work introduces a conflict.
- The benchmark will expose the expected full-array shift cost. If it does not, the executor must remove this attempt and return to performance target discovery rather than shipping a speculative rewrite.

### Risks and Mitigations

- **Ring-order off-by-one:** A wrong oldest-slot calculation can return correct lengths with scrambled history. Pin no-wrap, first-wrap, multi-wrap, limit-one, and disposal-wrap sequences.
- **Cost transfer to ordinary scopes:** A new cursor or eager buffer allocation would tax tracing-disabled scopes. Reuse the existing sequence and event array, and retain the early zero-limit return.
- **Benchmark distortion:** Object creation or signal writes can hide the retention cost. Use the same production call path for every scenario, normalize per event, alternate order, and compare wrapped work with an unfilled control in the same process.
- **Noisy timing threshold:** Do not infer a guard from one sample. Use warmups and repeated baseline and candidate runs, with deterministic sequence checks as the correctness gate.

### Sources and Research

- `packages/octane/src/signals/engine.ts` owns bounded trace retention and inspection copying.
- `packages/octane/tests/signals-inspection.test.ts` pins opt-in behavior, maximum history, chronological sequence, privacy, and copy isolation.
- `benchmarks/scoped-signals/` is the existing renderer-free signal performance and correctness surface.
- `.agents/memories/core-engineering.md` requires pre-change measurement, same-environment comparison, direct common paths, and removal of abandoned experiments.

---

## Implementation Units

### U1. Add a focused signal trace benchmark

- **Goal:** Create reproducible baseline evidence for full bounded traces and retain it as a regression surface.
- **Requirements:** R5, R6, R7
- **Dependencies:** None
- **Files:**
  - `benchmarks/scoped-signals/run-trace.mjs`
  - `benchmarks/scoped-signals/README.md`
  - `benchmarks/bench.mjs`
- **Approach:** Add unfilled, small wrapped, and maximum-limit wrapped scenarios around the production scope implementation. Validate the exact final sequence outside timed intervals. Normalize timing per fixed event count and alternate scenario order across samples. Register the workload with the unified runner, but defer its ratio entry until U3 has baseline and candidate evidence.
- **Execution note:** Run and preserve the baseline before changing `ScopeImpl`. If the maximum-limit wrapped case is not materially slower than the unfilled control, remove the attempt and return to target discovery.
- **Patterns to follow:** `benchmarks/floating-tree-navigation/run.mjs` for previous-behavior correctness gates and `benchmarks/router-dispatch/run.mjs` for Node-only normalized timing output.
- **Test scenarios:**
  - An unfilled trace retains every emitted sequence in order and reports normalized timing without wrapping.
  - A small wrapped trace retains exactly the last `traceLimit` sequences in ascending order.
  - A maximum-limit trace retains the expected final sequence range after sustained writes and produces stable repeated samples.
  - Invalid benchmark iteration input exits with a clear failure instead of producing misleading data.
- **Verification:** The focused script and unified quick runner produce valid BENCH_JSON output, exact sequence metadata, and a reproducible pre-change baseline.

### U2. Replace front-removal with bounded slot replacement

- **Goal:** Make trace retention bounded per event while preserving the inspection contract.
- **Requirements:** R1, R2, R3, R4, R5, R7
- **Dependencies:** U1
- **Files:**
  - `packages/octane/src/signals/engine.ts`
  - `packages/octane/tests/signals-inspection.test.ts`
- **Approach:** Implement KTD1 on the write path and KTD2 on the inspection path. Keep the zero-limit return first. Retain event-object creation and detached inspection copies. Extend focused tests before relying on benchmark output.
- **Execution note:** Add the wrap-boundary regression cases before editing the retention algorithm, then compare the candidate with U1's unchanged baseline command and environment.
- **Patterns to follow:** The existing `trace()` and `inspect()` ownership boundary in `packages/octane/src/signals/engine.ts` and the observable-only assertions in `packages/octane/tests/signals-inspection.test.ts`.
- **Test scenarios:**
  - With `traceLimit: 1`, repeated writes and disposal expose only the latest event with the correct sequence and type.
  - With `traceLimit: 3`, the first three events remain ordered before wrapping, the fourth replaces only the oldest, and multiple later wraps still expose ascending sequences.
  - Disposal of a scope with a full trace records `retire` as the newest event and evicts the oldest event.
  - Mutating every record returned by one post-wrap inspection does not affect a later inspection.
  - A scope without debug tracing still reports an empty trace after writes and disposal.
- **Verification:** Focused tests prove the public inspection contract, and candidate benchmark runs show bounded full-buffer behavior without a material unfilled-control regression.

### U3. Calibrate the regression guard and release note

- **Goal:** Make the measured improvement durable and publish it at the correct package scope.
- **Requirements:** R6, R7, R8
- **Dependencies:** U1, U2
- **Files:**
  - `benchmarks/baselines/ratios.json`
  - `.changeset/clean-signal-trace-retention.md`
- **Approach:** Compare repeated baseline and candidate benchmark results, then choose a same-run ratio ceiling that catches restoration of front-removal with broad timing headroom. Add a patch changeset for `octane` that describes only the trace-retention improvement and preserved semantics.
- **Patterns to follow:** Existing benchmark ratio entries pair a target, a same-run reference, a conservative ceiling, and evidence-backed rationale. Existing `octane` performance changesets use the patch track.
- **Test scenarios:**
  - The candidate passes the new ratio guard in quick and full focused runs.
  - The recorded previous implementation breaches the proposed guard or remains far enough outside it that the guard is load-bearing.
  - The changeset names only `octane` and does not claim unrelated renderer or application speedups.
- **Verification:** The ratio configuration is valid, the focused suite passes with `--ratios`, and changeset validation accepts the new patch entry.

---

## Verification Contract

| Gate | Scope | Done signal |
| --- | --- | --- |
| Focused correctness | `pnpm test -- --project octane packages/octane/tests/signals-inspection.test.ts` | All inspection, wrap, disposal, and copy-isolation scenarios pass. |
| Baseline and candidate evidence | `node benchmarks/bench.mjs --quick scoped-signals-trace` and full focused runs | Same harness and environment show a material wrapped-path reduction without a material unfilled-control regression. |
| Durable performance guard | `node benchmarks/bench.mjs --quick --ratios scoped-signals-trace` | The candidate passes the calibrated ratio and the guard is demonstrably sensitive to the previous algorithm. |
| Type safety | `pnpm typecheck` | Signal implementation and benchmark integration introduce no type errors. |
| Formatting | `pnpm format:check` | Source, tests, benchmark files, JSON, plan, and changeset meet repository formatting. |
| Final regression | Relevant Octane project tests, followed by the repository test gate when time permits | No signal behavior, retirement, or package precheck regresses. |

Browser testing is not applicable. The changed path is renderer-free and Node-only; no DOM, hydration, layout, or event surface is involved.

---

## Definition of Done

- U1 is done when the focused benchmark reproduces the old full-buffer cost and validates exact retained history.
- U2 is done when trace writes use bounded slot replacement and every observable inspection invariant passes.
- U3 is done when repeated measurements support a conservative ratio guard and the `octane` patch changeset is present.
- The implementation is based on the fetched latest `origin/main` and does not overlap any recent or open performance PR identified in research.
- Baseline and candidate commands, environment, and results are preserved for the PR handoff.
- The final diff contains no abandoned algorithms, temporary probes, untracked benchmark outputs, unrelated cleanup, or fallback-target code.
- Review, focused verification, formatting, commit, push, PR creation, and CI follow-through complete without unresolved actionable findings.
