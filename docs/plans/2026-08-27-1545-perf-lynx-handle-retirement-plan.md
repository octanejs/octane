---
title: Lynx Handle Retirement Scaling - Plan
type: perf
date: 2026-08-27
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Lynx Handle Retirement Scaling - Plan

## Goal Capsule

- **Objective:** Lynx applications can retire a small collapsed host run without acknowledgement preparation growing with unrelated live handles.
- **Means:** Collect materialized handles from the smaller of the retired ID range and the live-handle map while preserving the acknowledgement contract (KTD1).
- **Authority:** The user request, observable Lynx transport semantics, repository tests and benchmark rules, then implementation convenience.
- **Execution profile:** Standard, code, performance-first.
- **Stop condition:** If the pre-change workload does not reproduce the scaling penalty, or the candidate fails the target and inverse scaling gates, remove the experiment and select a different source-backed optimization.
- **Tail ownership:** The LFG pipeline owns review, verification, release commit, pull request creation, and CI follow-through.

---

## Product Contract

### Summary

Optimize exact Lynx `remove-run` acknowledgement preparation so work follows the smaller relevant domain instead of always scanning every materialized handle.
Keep exact retirement, survivor, rollback, compact-host, and validation behavior unchanged.

### Problem Frame

`prepareLynxHandleDeltas` currently scans the complete `state.handles` map for each exact `remove-run` acknowledgement, even though the acknowledgement supplies a contiguous host-ID range.
A small retired range in a container with many unrelated materialized handles therefore pays O(H) membership work, where H is the full live-handle count.
Multiple exact run removals can repeat that unrelated scan.

An unconditional walk over the retired range is not safe as a performance replacement.
Compact runs may contain many hosts but only a few lazily materialized handle entries, so such a replacement can move the same waste onto the inverse workload.

### Requirements

**Retirement performance**

- R1. Preparing a small exact `remove-run` acknowledgement amid many unrelated materialized handles must not traverse every unrelated handle.
- R2. Preparing a large exact compact run with few materialized handles must not add work proportional to every unmaterialized host ID.
- R3. A focused same-process benchmark must gate both scaling directions with semantic checks and warm, alternating samples.

**Transport behavior**

- R4. Exact retirement must invalidate only materialized handles inside the acknowledged range and preserve every survivor outside it.
- R5. Rollback must restore the same public handle facades, active state, compact reachability, generations, and retired-range state that existed before apply.
- R6. Existing duplicate, mixed exact/per-host, malformed, overflow, and omitted-delta rejection behavior must remain unchanged.

**Shipping discipline**

- R7. The optimization must start from the latest `origin/main` and remain distinct from the recent performance work enumerated in the request.
- R8. The change must include an honest `@octanejs/lynx` patch changeset and must not retain code from a disproven performance hypothesis.

### Acceptance Examples

- AE1. Covers R1 and R4. Given a small exact retired range inside a container with a much larger materialized handle map, preparation examines the range domain, apply invalidates only in-range handles, and outside handles retain identity.
- AE2. Covers R2 and R4. Given a large compact retired range with only a few materialized handles, preparation examines the live-handle domain and apply still retires the compact metadata for the full range.
- AE3. Covers R5. Given materialized handles inside a partial compact range and survivors on both sides, apply retires the in-range facades and rollback restores those exact facades while leaving both survivors untouched.
- AE4. Covers R6. Given a duplicate exact acknowledgement or an exact acknowledgement after partial per-host removal for the same run, preparation rejects it through the existing validation path.

### Success Criteria

- With a fixed small retired range, normalized preparation cost at the large live-handle scale is no more than 1.5 times the small-scale control.
- With a fixed small materialized-handle count, normalized preparation cost at the large retired-range scale is no more than 1.5 times the small-scale control.
- As recorded acceptance evidence, the large live-handle target's final median preparation cost is at least 1.5 times faster than the pre-change median; otherwise abandon this candidate. This historical comparison is not a portable CI ratio guard.
- The benchmark records the pre-change scaling result before source edits and the final same-run result after self-review.
- Focused Lynx protocol tests, the Lynx package typecheck, formatting, and the registered benchmark ratio gates pass.

### Scope Boundaries

**In scope**

- Exact `remove-run` materialized-handle collection in the Lynx client acknowledgement path.
- Partial compact-range apply and rollback coverage.
- A focused benchmark with load-bearing scaling guards.
- The package changeset and benchmark baseline artifacts required by repository convention.

**Out of scope**

- The per-host `remove` fallback algorithm and `runCommands` exact/coverage lookup structures.
- Main-thread `destroy-run` expansion, host-driver teardown, or wire protocol shapes.
- Public API changes, compact acknowledgement thresholds, or native rendering claims.
- The compiler dependency-merge and app-core export-selection candidates found during research, unless this hypothesis is disproven and the run is replanned around one of them.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Traverse the smaller membership domain.** For each exact run, use direct lookups across its contiguous ID range only when that range is smaller than `state.handles`; otherwise retain the existing map scan. A tie stays on the established map path.
- KTD2. **Limit the source change to entry collection.** Preserve the current snapshot capture, run-removal record, apply, rollback, compact metadata, generation, retired-range, and acknowledgement validation paths.
- KTD3. **Gate both sides of the hybrid.** One benchmark curve holds the retired range constant while growing materialized handles; a second holds materialized handles constant while growing the retired range. Each target carries an observable retirement checksum.
- KTD4. **Measure before editing and abandon a false hypothesis.** Capture the current scaling curves first. Do not ship the source change if the expected full-map penalty does not reproduce or the hybrid shifts comparable work to the inverse case.

### Assumptions

- Exact `destroy-run` commands own contiguous safe-integer host-ID ranges, as enforced by the existing Lynx protocol validation.
- The relative invalidation order of multiple handles inside one exact retired range is not a public contract. If implementation evidence contradicts this, preserve map iteration order and move to another optimization rather than weakening behavior.
- A Node-hosted preparation benchmark supports a CPU-scaling claim for the background acknowledgement path only. It does not support a native paint, layout, or device-performance claim.
- The benchmark can build or import the existing core source through the repository's established Node/Vite benchmark pattern without adding production dependencies.
- The Node benchmark must bundle the TypeScript Lynx source before execution because its `.js` import specifiers do not resolve against unbuilt source files.

### Risks and Mitigations

- **Inverse-path regression:** A direct range walk can regress dense compact teardowns. KTD1 keeps the map path when the materialized map is smaller, and the inverse benchmark curve guards this choice.
- **Hidden ordering behavior:** Direct ID lookup yields numeric range order rather than map insertion order. The focused apply/rollback test must assert all public state, and any discovered observable order requires abandoning or redesigning the optimization.
- **Benchmark setup contamination:** Container construction can dominate short samples. Build fixtures outside timed regions, warm each scenario, alternate scenario order, normalize the measured operation, and validate a checksum after timing.
- **Noisy sub-millisecond samples:** Repeat preparation inside one timing window and use same-process scale ratios with headroom instead of absolute latency claims.

### Research Breadcrumbs

- `packages/lynx/src/core/client-driver.ts` contains the exact `remove-run` collection, apply, and rollback lifecycle.
- `packages/lynx/tests/protocol.test.ts` already covers full compact retirement, per-host fallback, rollback, retired-range reuse, and fresh compact re-arming.
- `benchmarks/router-dispatch/run.mjs`, `benchmarks/lynx-list/run.mjs`, `benchmarks/bench.mjs`, and `benchmarks/baselines/ratios.json` show the current Node-only same-process scaling, source-bundling, and ratio-guard patterns.
- Git history attributes the full-map scan to the collapsed-run teardown work in PR #750. It is separate from the recent performance PRs excluded by the request.

---

## Implementation Units

### U1. Establish the handle-retirement scaling benchmark

- **Goal:** Reproduce the full-map scaling penalty and define the two semantic scaling curves before changing the acknowledgement implementation.
- **Requirements:** R1, R2, R3, R4; KTD3, KTD4.
- **Dependencies:** None.
- **Files:**
  - `benchmarks/lynx-handle-retirement/README.md`
  - `benchmarks/lynx-handle-retirement/run.mjs`
  - `benchmarks/bench.mjs`
- **Approach:**
  1. Bundle the Lynx TypeScript source with the established `benchmarks/lynx-list/run.mjs` esbuild pattern, then build reusable containers outside timed regions through that surface.
  2. Measure repeated exact retirement preparation without applying mutations inside the timing samples.
  3. Cover a fixed small range at two materialized-handle scales and a fixed small materialized set at two compact-range scales.
  4. Alternate scenario order, warm each scenario, normalize the score, and emit unified benchmark JSON.
- **Execution note:** Record the unmodified `origin/main` result first. Stop this target if the live-handle curve does not reproduce a material scaling penalty.
- **Patterns to follow:** `benchmarks/router-dispatch/run.mjs` for same-process timing and correctness gates; `benchmarks/README.md` for runner output contracts.
- **Test scenarios:**
  - A small exact range amid the small and large explicit-handle fixtures produces the same in-range and survivor checksum while exposing the live-handle scaling curve.
  - A small materialized set inside the small and large compact ranges produces the same retirement checksum while exposing the inverse range-size curve.
  - Repeated warm samples produce identical semantic checksums, and reversed scenario order does not change results.
- **Verification:** The suite runs through the unified harness, emits both curves, passes its semantic gates, and records a clear pre-change verdict.

### U2. Bound exact retirement preparation by the smaller domain

- **Goal:** Remove unrelated live-handle scans without adding a dense compact-range scan or changing transport behavior.
- **Requirements:** R1, R2, R4, R5, R6; KTD1, KTD2.
- **Dependencies:** U1.
- **Files:**
  - `packages/lynx/src/core/client-driver.ts`
  - `packages/lynx/tests/protocol.test.ts`
- **Approach:**
  1. Select range lookup only when the exact run's host count is smaller than the materialized handle-map size.
  2. Feed both traversal paths into the existing materialized-entry snapshot and run-removal record.
  3. Leave acknowledgement matching, per-host fallback, apply, rollback, and compact retirement mechanics intact.
  4. Strengthen the existing protocol suite with a partial compact range that has materialized entries inside the range and survivors on both sides.
- **Execution note:** Keep the diff at the observation boundary. If invalidation order proves observable or either benchmark curve regresses, remove this attempt and select another candidate.
- **Patterns to follow:** The current `prepareLynxHandleDeltas` staged apply/rollback model and the compact retirement cases in `packages/lynx/tests/protocol.test.ts`.
- **Test scenarios:**
  - Applying a partial exact retirement invalidates only materialized in-range facades and keeps both outside survivor facades active and identical.
  - Rolling back that retirement restores the same in-range facade identities, active state, snapshot access, and compact reachability.
  - Reapplying after rollback retires the range and preserves fresh-generation and retired-range reuse checks.
  - Existing duplicate exact, mixed exact/per-host, omitted, malformed, and overflow acknowledgement cases retain their current errors.
- **Verification:** Focused protocol tests pass, the two benchmark curves meet their gates, and inspection confirms no validation or apply/rollback contract changed.

### U3. Make the performance result durable and releasable

- **Goal:** Commit honest ratio guards, a local benchmark record, and the package release note after the final implementation settles.
- **Requirements:** R3, R7, R8; KTD3, KTD4.
- **Dependencies:** U1, U2.
- **Files:**
  - `benchmarks/baselines/ratios.json`
  - `benchmarks/baselines/local/lynx-handle-retirement.json`
  - `.changeset/lynx-handle-retirement.md`
- **Approach:**
  1. Add the two portable 1.5 scaling ceilings, and record the direct target's pre-change and final results as acceptance evidence.
  2. Record the final local benchmark payload after self-review and remeasurement.
  3. Add a patch changeset that states the bounded acknowledgement improvement without claiming native rendering gains.
- **Patterns to follow:** Existing timing-ratio notes in `benchmarks/baselines/ratios.json` and existing `@octanejs/lynx` performance changesets.
- **Test scenarios:**
  - The unified runner recognizes the suite and enforces both ratio records.
  - The changeset names only `@octanejs/lynx`, uses the patch track, and reports numbers produced by the committed benchmark.
- **Verification:** The committed benchmark payload matches the final source, both ratio guards pass in quick mode, and changeset validation accepts the release note.

---

## Verification Contract

| Gate | Scope | Done signal |
| --- | --- | --- |
| Focused protocol behavior | `./node_modules/.bin/vitest run packages/lynx/tests/protocol.test.ts --reporter=verbose` | Exact, fallback, apply, rollback, and reuse cases pass. |
| Lynx types | `pnpm --dir packages/lynx typecheck` | Source, testing, and typetest projects report no errors. |
| Performance ratios | `node benchmarks/bench.mjs --quick --ratios lynx-handle-retirement` | Both portable same-run scaling ceilings and all semantic checks pass. |
| Recorded direct speedup | Main and final eight-iteration evidence in `benchmarks/lynx-handle-retirement/README.md` | The large live-handle target improves by at least 1.5 times; this one-time acceptance comparison is not represented as a CI ratio gate. |
| Formatting | `pnpm format:files:check -- packages/lynx/src/core/client-driver.ts packages/lynx/tests/protocol.test.ts benchmarks/lynx-handle-retirement benchmarks/bench.mjs benchmarks/baselines/ratios.json benchmarks/baselines/local/lynx-handle-retirement.json .changeset/lynx-handle-retirement.md` | Every changed file matches repository formatting. |
| Changeset | `pnpm changeset:check` | The Lynx patch changeset is valid. |

The performance exit criterion is both dimensional and absolute: the fixed-range curve must stop scaling with unrelated live handles, the fixed-materialized curve must remain bounded as compact range size grows, and the recorded large live-handle target must improve by at least 1.5 times against its pre-change median. The two dimensional checks remain portable ratio guards; the absolute pre/post result is acceptance evidence from the recorded environment.
Remeasure after self-review so the reported ratios describe the final diff.

---

## Definition of Done

- U1 has a reproducible pre-change baseline, semantic checks, and both scaling dimensions.
- U2 preserves exact retirement, survivor identity, rollback, compact metadata, generation, and rejection behavior.
- U3 records final ratios, local benchmark output, and a valid `@octanejs/lynx` patch changeset.
- The latest `origin/main` remains the branch base and the diff does not duplicate the recent performance PR topics from the request.
- Focused tests, Lynx typecheck, formatting, changeset validation, and both benchmark ratios pass.
- Final benchmark notes distinguish background acknowledgement CPU scaling from native rendering performance.
- Any abandoned candidate code, temporary instrumentation, and disproven benchmark assumptions are removed from the diff.
