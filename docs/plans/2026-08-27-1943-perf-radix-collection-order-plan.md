---
title: Index Radix Collection Ordering - Plan
type: perf
date: 2026-08-27
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Index Radix Collection Ordering - Plan

## Goal Capsule

- **Objective:** Large Radix menus, selects, tabs, accordions, sliders, toasts, and navigation menus keep responsive keyboard and pointer interactions as item counts grow, with existing DOM-order and accessibility behavior unchanged.
- **Means:** Pre-index DOM positions once for collection reads that cross a measured size threshold, then reuse the index during stable item ordering (KTD1, KTD2).
- **Authority:** Preserve observable Radix behavior first, then satisfy the same-process performance guard, then minimize implementation complexity.
- **Execution profile:** Code change with behavioral controls, deterministic benchmark evidence, and a patch changeset.
- **Stop conditions:** Abandon this target and remove its experimental diff if the production path cannot beat the current comparator by the R5 threshold without regressing the measured small-list control or changing R1-R3 behavior.
- **Tail ownership:** Ship only after the Radix package checks, unified benchmark ratio, repository quality gates, and review findings are resolved.

---

## Product Contract

### Summary

Replace repeated DOM-position scans inside Radix collection sorting with a measured indexed path for large collections. Keep the current path for collection sizes where indexing does not pay for itself.

### Problem Frame

`packages/radix/src/collection.ts` obtains current DOM order, copies the registered item map, and sorts the items. Its comparator calls `orderedNodes.indexOf(...)` for both operands on every comparison. A single collection read therefore repeats whole-node scans throughout the sort. Radix primitives call this read path during keyboard focus movement, selection, pointer interactions, and layout work, so the avoidable cost is paid in user interactions and grows rapidly with collection size.

The target is distinct from the recent performance work opened by the requester. The 2026-08-25 through 2026-08-27 comparison set covers compiler indexing and diagnostics, manifest and client-asset caches, router dispatch, runtime diagnostics and queues, hydration templates, Lynx teardown, and Visx categorical lookup. It does not touch `@octanejs/radix` collection ordering.

### Requirements

**Behavior and compatibility**

- R1. Every registered item must retain the same order that the current DOM-position comparator returns.
- R2. Items with a null ref or a ref outside the collection root must keep the current stable ordering semantics ahead of positioned items.
- R3. Radix consumers must retain existing keyboard focus, selection, disabled-item filtering, portal, and accessibility behavior.

**Performance evidence**

- R4. A large collection read must avoid calling `Array#indexOf` for each sort comparison.
- R5. The production indexed path at 4,096 ordered items must complete at no more than 0.15x the same-process current-comparator reference while producing an identical checksum and order.
- R6. The 16- and 64-item production controls must execute the current comparator and complete within 1.15x the same-process reference; the indexed threshold must be the smallest measured size at or above 256 items whose median cost is no more than 0.80x the reference.

**Release hygiene**

- R7. The change must include a patch changeset for `@octanejs/radix` and keep the pinned upstream ledger valid.

### Acceptance Examples

- AE1. **Covers R1, R2.** Given registered items whose refs are null, outside the root, and inside the root in a different DOM order, when the collection is read, then the optimized and current comparators return the same stable sequence.
- AE2. **Covers R1, R3.** Given a Radix roving-focus primitive with items in DOM order, when the user presses next, previous, Home, and End keys, then focus and activation follow the same enabled items as before.
- AE3. **Covers R4-R6.** Given 16, 64, 256, and 4,096 ordered items, when the same process runs the production helper and the current-comparator reference, then correctness controls match, the small controls clear R6, and the large case clears R5.

### Scope Boundaries

In scope is the shared legacy collection helper used by Radix primitives, its behavioral evidence, one unified benchmark suite, and release metadata.

#### Deferred to Follow-Up Work

- Other repeated-search or queue-drain candidates discovered during the audit remain separate performance targets.
- Replacing the DOM query or changing Radix's registration model is outside this optimization.
- Porting upstream Radix's newer collection abstraction is outside this optimization.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Index large collection DOM positions once.** Build a node-to-position map once per qualifying collection read and make comparator lookups constant-time. This preserves the existing stable sort and its treatment of missing refs while removing repeated whole-node scans. Governs R1, R2, R4.
- KTD2. **Protect the small-list path with a measured crossover.** Extract the current comparator into a production helper, measure both algorithms at the R6 sizes, and set the indexed threshold from the first qualifying result. If no candidate clears R6, abandon this target per the Goal Capsule. Governs R4-R6.
- KTD3. **Benchmark the production helper against the exact prior algorithm.** The benchmark imports the helper used by `createCollection`, includes index construction in each sample, alternates target order, and rejects timing data unless permutations and checksums match. Governs R1, R2, R5, R6.
- KTD4. **Keep this as an Octane performance adaptation.** Do not edit vendored upstream files or claim broader upstream parity. Preserve the existing upstream source boundary and verify the ledger. Governs R3, R7.

### Assumptions

- The clean detached worktree at `origin/main` commit `f036bad8d1e0e095694b8bbc71e95d13e01a7330` is an appropriate base. Refresh the base before implementation if `origin/main` advances.
- ECMAScript stable sort is part of the supported Node and browser baseline, so equal missing positions preserve item-map insertion order.
- Large Select, Menu, NavigationMenu, Toast, Accordion, Slider, Menubar, and RovingFocusGroup collections are credible consumers because each calls the shared collection reader during interaction or layout work.
- A Node-only synthetic-node benchmark isolates the accidental algorithmic cost. Existing Radix integration tests remain the behavioral control for real DOM and focus behavior.
- The 4,096-item case is large enough to expose the scaling defect. R6 defines the smaller cases and crossover rule so implementation does not tune the threshold by feel.

### Risks and Mitigations

- **Small collections could pay more allocation cost.** Measure small sizes and retain the current comparator below the crossover required by R6.
- **Missing or disconnected refs could reorder.** Gate every timing run with the AE1 reference permutation and retain stable sort semantics.
- **A benchmark-only helper could drift from production.** Import the same internal ordering helper that `packages/radix/src/collection.ts` calls.
- **The local adaptation could obscure upstream provenance.** Keep vendored upstream sources untouched and run the Radix ledger check.

### Sources and Research

- `packages/radix/src/collection.ts` owns registration and DOM-order collection reads.
- `packages/radix/src/RovingFocusGroup.ts`, `packages/radix/src/Menu.ts`, `packages/radix/src/Select.ts`, and `packages/radix/src/NavigationMenu.ts` demonstrate interaction-time collection reads.
- `packages/radix/tests/alert-tabs.test.ts`, `packages/radix/tests/menubar.test.ts`, and `packages/radix/tests/select.test.ts` provide existing public behavior controls.
- `packages/radix/UPSTREAM.md` defines the pinned source boundary and ledger expectations.
- `benchmarks/router-dispatch/run.mjs`, `benchmarks/manifest-cache-invalidation/run.mjs`, and `benchmarks/baselines/ratios.json` establish the merged same-process reference and ratio-guard pattern on the latest default branch.

---

## Implementation Units

### U1. Extract and characterize collection ordering

- **Goal:** Put the current production ordering algorithm behind a pure internal helper and establish semantic controls before optimization.
- **Requirements:** R1-R3, R6.
- **Dependencies:** None.
- **Files:**
  - Create `packages/radix/src/collection-order.ts`.
  - Modify `packages/radix/src/collection.ts`.
  - Modify `packages/radix/tests/alert-tabs.test.ts` only if existing focus-order coverage cannot exercise the optimized branch without implementation-coupled assertions.
  - Create `benchmarks/radix-collection-order/run.mjs`.
- **Approach:**
  1. Move the current DOM-position comparator into a typed internal helper without changing its output or allocation behavior.
  2. Route `createCollection` through the helper while leaving DOM querying and item registration in `collection.ts`.
  3. Add benchmark correctness gates for DOM-reordered items, null refs, outside-root refs, and equal-position stability.
  4. Record the current-comparator baseline before changing its algorithm.
- **Execution note:** Establish the reference permutation and baseline first. Do not keep a helper extraction that changes consumer behavior.
- **Patterns to follow:** `packages/radix/src/collection.ts` for item shape and `benchmarks/router-dispatch/run.mjs` for same-process correctness gates.
- **Test scenarios:**
  - Covers AE1. Interleave null, outside-root, and positioned refs; assert the extracted helper matches the inlined prior comparator exactly.
  - Covers AE2. Run the existing tabs, menubar, and select interaction suites; assert next, previous, Home, End, disabled-item, and selection outcomes remain unchanged.
  - Use empty and single-item inputs; assert the helper returns the same sequence without special-case drift.
- **Verification:** The helper is production-owned, the benchmark can reproduce the prior algorithm, and all existing Radix collection consumers behave identically.

### U2. Add the measured indexed large-collection path

- **Goal:** Remove repeated position scans for large collection reads without penalizing the common small-list path.
- **Requirements:** R1-R6.
- **Dependencies:** U1.
- **Files:**
  - Modify `packages/radix/src/collection-order.ts`.
  - Modify `benchmarks/radix-collection-order/run.mjs`.
  - Create `benchmarks/radix-collection-order/README.md`.
  - Modify `benchmarks/bench.mjs`.
  - Modify `benchmarks/README.md`.
  - Modify `benchmarks/baselines/ratios.json`.
- **Approach:**
  1. Build one node-position index when item count reaches the measured crossover from KTD2.
  2. Keep the existing comparator below that crossover.
  3. Compare production and reference targets in alternating order at 16, 64, 256, and 4,096 items.
  4. Add the R5 same-run ratio guard only after repeated normal runs support enough noise headroom.
- **Execution note:** If the indexed path misses R5, changes order, or materially regresses the small control, delete the attempt and select another distinct performance target instead of weakening the guard.
- **Patterns to follow:** `benchmarks/bench.mjs` suite registration, `benchmarks/baselines/ratios.json` timing-ratio notes, and `benchmarks/lib/stats.mjs` sample summaries.
- **Test scenarios:**
  - Covers AE3. Compare current and production ordering at 16, 64, 256, and 4,096 items with identical permutations and checksums before accepting timings.
  - Place duplicate item records on the same node and refs outside the ordered-node set; assert stable output matches the reference.
  - Alternate target order across iterations; assert both directions satisfy correctness gates and the large production target clears R5.
  - Re-run the full Radix package suite after the threshold is active; assert no focus, portal, selection, or accessibility regression.
- **Verification:** The unified quick and normal benchmark passes its ratio guard, the small control stays on the prior path, and Radix behavior remains unchanged.

### U3. Record release and provenance evidence

- **Goal:** Make the user-facing package optimization publishable and keep the upstream boundary auditable.
- **Requirements:** R7.
- **Dependencies:** U2.
- **Files:**
  - Create `.changeset/faster-radix-collection-order.md`.
  - Modify `packages/radix/UPSTREAM.md` only if the checker requires an explicit local-adaptation note.
- **Approach:** Add a patch changeset that describes faster large-collection ordering without promising behavior beyond the benchmarked contract. Keep vendored `packages/radix/upstream/` content unchanged.
- **Patterns to follow:** Recent patch changesets for `@octanejs/radix` and the source-boundary language in `packages/radix/UPSTREAM.md`.
- **Test scenarios:** Test expectation: none -- this unit records release metadata and must not change runtime behavior.
- **Verification:** Changeset validation recognizes one patch release and the Radix upstream ledger remains valid.

---

## Verification Contract

| Gate | Evidence | Done signal |
| --- | --- | --- |
| Targeted Radix behavior | `./node_modules/.bin/vitest run packages/radix/tests/alert-tabs.test.ts packages/radix/tests/menubar.test.ts packages/radix/tests/select.test.ts --reporter=verbose` | Focus, selection, disabled-item, portal, and accessibility scenarios pass. |
| Radix package regression | `./node_modules/.bin/vitest run --project radix` | All package tests pass. |
| Performance quick check | `node benchmarks/bench.mjs --quick --ratios radix-collection-order` | Correctness gates and the R5 ratio pass. |
| Performance evidence | `node benchmarks/bench.mjs --ratios radix-collection-order` | Repeated normal samples pass with the committed ratio headroom. |
| Upstream boundary | `node packages/radix/scripts/check-upstream-ledger.mjs` | Vendored hashes, package graph, and export crosswalk remain valid. |
| Repository type gate | `pnpm typecheck` | Workspace type checks pass. |
| Repository formatting | `pnpm format:check` | No formatting drift. |
| Full regression | `pnpm test` | Root Vitest and package prechecks pass. |

---

## Definition of Done

- U1 is complete when production collection reads use the characterized helper and semantic controls match the prior comparator.
- U2 is complete when the production indexed path passes R1-R6, including the committed large-case ratio guard and small-list control.
- U3 is complete when the patch changeset and upstream-ledger evidence pass.
- The branch is based on the latest `origin/main` available when implementation begins and does not overlap the requester's recent performance PRs.
- The final diff contains no abandoned benchmark variants, unused helpers, temporary instrumentation, or code from a disproven hypothesis.
- Review findings are resolved or recorded through the pipeline's durable residual process.
- The open PR includes measured baseline and candidate results, correctness commands, and any residual risk.
