---
title: Manifest Cache Invalidation - Plan
type: perf
date: 2026-08-27
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Manifest Cache Invalidation - Plan

## Goal Capsule

- **Objective:** Octane developers working in large projects no longer pay a project-wide manifest-cache traversal for each ordinary watched source change.
- **Means:** Reject changed paths that cannot name a package manifest before scanning the shared compiler caches (KTD1).
- **Authority:** The user request and its non-duplication/evidence constraints outrank this plan. Current `origin/main` source and tests outrank summaries. Measured benchmark evidence outranks source-level intuition.
- **Execution profile:** Baseline-first optimization on a dedicated branch created from `origin/main` at `cfa753bcd`; one focused pull request.
- **Stop conditions:** Abandon this target if the baseline does not reproduce cache-size-dependent ordinary invalidation work, if a cache can depend on a non-`package.json` path, or if the candidate fails the performance threshold in KTD3. Select and plan a different non-overlapping target instead of weakening the evidence bar.
- **Tail ownership:** Implementation, regression proof, benchmark integration, review fixes, repository synchronization, pull request creation, and current-head CI.

## Product Contract

### Summary

Remove needless manifest-cache membership scans from ordinary compiler watch invalidations while preserving every manifest change, full-reset, and diagnostic-generation behavior.

### Problem Frame

The Vite compiler adapter calls the shared compiler invalidation entry point for every watched path. The shared compiler then walks every cached nearest-package decision and searches its dependency arrays, even when the changed path is an ordinary source module. Repository inspection shows those cache dependencies are package manifests, so the common source-edit path pays work that cannot change the cache result. The cost grows with the number of cached source directories and their manifest lookup depth.

This target is separate from the recent author-owned performance pull requests for scheduler depth, TypeScript text roots, compiler reachability and hoist analysis, Vite client assets, app routing, SSR boundary pruning, diagnostics, generated names, and queue drains.

### Requirements

**Performance and evidence**

- R1. The optimization must remove manifest-cache traversal from ordinary non-manifest path invalidation in the shared compiler owner.
- R2. A same-machine baseline and candidate run must show that ordinary invalidation no longer scales with the populated manifest cache and meets KTD3.
- R3. If R2 fails because the hypothesis is wrong, discard the attempt and select a different non-overlapping performance target.

**Behavior preservation**

- R4. An exact package manifest change must still evict every nearest-package and discovery entry that depends on that present or previously missing manifest.
- R5. A full invalidation without a path must still clear both manifest and discovery caches.
- R6. Every path invalidation must still begin a new compiler diagnostic generation, including non-manifest changes that skip cache work.
- R7. Query and hash suffix cleanup must occur before the manifest-path classification so bundler-decorated manifest IDs retain current behavior.

**Repository delivery**

- R8. The change must include behavioral compiler coverage, a benchmark with semantic controls, a durable ratio guard, and an Octane patch changeset.
- R9. The pull request must remain distinct from the recent performance work identified during planning and must be refreshed against the live default branch before readiness.

### Key Decisions

- **Non-overlapping target** (session-settled: user-directed — chosen over duplicating or extending a recent author-owned performance pull request: the user required a distinct performance improvement). Governs R1, R9.
- **Evidence controls shipment** (session-settled: user-directed — chosen over keeping or shipping a disproven optimization hypothesis: the user required moving to another target when measurement falsifies the idea). Governs R2, R3.
- **Fresh isolated worktree** (session-settled: user-directed — chosen over implementing on the stale, already-occupied performance checkout: the user required the latest default branch and a different worktree when work conflicts). Governs R9.

### Scope Boundaries

- Optimize shared compiler invalidation only. Do not redesign the manifest-cache representation or add a retained reverse index.
- Preserve adapter call sites so Vite and Rspack continue reporting changes through the same compiler contract.
- Do not modify the compiler transform, renderer, TypeScript project, scheduler, runtime, SSR, or client-asset hot paths covered by recent performance work.

## Planning Contract

### Key Technical Decisions

- KTD1. **Use a cold manifest-name gate in the shared invalidation owner.** Resolve and clean the changed path as today, preserve the diagnostic-generation reset, handle full invalidation first, and then return before cache iteration unless the basename is `package.json`. Source inspection shows both `manifestRuleCache` and `discoveryCache` metadata contain only present or missing package-manifest paths.
- KTD2. **Keep adapters ignorant of cache internals.** Place the optimization in `packages/octane/src/compiler/bundler.js` so every adapter receives the same behavior and future callers cannot accidentally miss the fast path.
- KTD3. **Guard the improvement with same-process scaling and scan controls.** The benchmark will populate small and large nearest-manifest caches, alternate ordinary-source invalidation across both sizes, and retain a non-matching `package.json` invalidation at the large size that must still scan. After warmup, the candidate large-cache ordinary-source score must be no more than 1.5x the small-cache ordinary-source score and no more than 20% of the large manifest-scan control score. Main should fail both ratios because every path performs the same cache-size-dependent scan.
- KTD4. **Prove preserved behavior at the public compiler boundary.** Extend the existing bundler compiler suite to show that an ordinary source invalidation leaves a cached package decision stable, an exact manifest invalidation refreshes it, and a full invalidation still clears it. Benchmark-only assertions do not replace this contract coverage.

### Assumptions

- Every dependency and missing-dependency path retained by the two affected caches is an exact `package.json` path. Execution must re-audit all metadata producers before applying KTD1.
- A cache population representative of a large project will make the baseline scan/control parity and the candidate fast-path separation exceed timing noise. If it does not, R3 applies.
- The new Node-only benchmark should follow the existing runner, baseline, MCP discovery, and documentation conventions used by `router-dispatch`, `tsrx-nesting-diagnostics`, and the recent compiler performance suites.

### Sequencing

Capture the baseline with the new harness before editing production compiler source. Add the functional regression and production fast path next. Integrate the measured candidate into the ratio registry and generated repository surfaces only after the final benchmark remains decisive.

### Sources and Research

- `packages/octane/src/compiler/vite.js` calls compiler invalidation from `watchChange` for every watched ID.
- `packages/octane/src/compiler/bundler.js` constructs nearest-package and discovery metadata exclusively from `package.json` candidates, then linearly scans that metadata on every path invalidation.
- `packages/octane/tests/compiler/bundler-compiler.test.ts` contains the existing missing-manifest creation and cache-refresh scenario to extend.
- `benchmarks/README.md`, `benchmarks/bench.mjs`, and `benchmarks/baselines/ratios.json` define Node-only benchmark registration, result shape, and same-machine ratio enforcement.
- Recent author-owned performance pull requests #842, #843, #845, #850, #851, #856-#861, #863, #865, #868, and #871-#873 established the excluded overlap set.

## Implementation Units

### U1. Reproduce manifest-cache invalidation scaling

- **Goal:** Add a Node-only benchmark that isolates ordinary invalidation traversal from required manifest invalidation traversal and capture the current-main baseline.
- **Requirements:** R2, R3, R8.
- **Dependencies:** None.
- **Files:**
  - `benchmarks/manifest-cache-invalidation/README.md`
  - `benchmarks/manifest-cache-invalidation/run.mjs`
  - `benchmarks/bench.mjs`
- **Approach:**
  1. Populate compiler instances with small and large sets of project-owned source-directory manifest decisions without including setup work in the timed samples.
  2. Warm every scenario, alternate their sample order, and report normalized invalidation cost with the shared statistics helpers.
  3. Use ordinary source paths at both cache sizes as the scaling scenarios and a non-matching `package.json` path against the large cache as the required-scan control.
  4. Verify cache population and post-sample compiler behavior so a faster result cannot come from clearing the workload or skipping all invalidation semantics.
- **Execution note:** Run and retain the baseline result before any production-source edit. If the two baseline paths do not show comparable scan cost, stop this target under R3.
- **Patterns to follow:** `benchmarks/router-dispatch/run.mjs`, `benchmarks/tsrx-nesting-diagnostics/run.mjs`, and `benchmarks/lib/stats.mjs`.
- **Test scenarios:**
  - Populate the configured small and large cached source-directory sets, run ordinary invalidations, and require both cache populations and compiler classification checksums to remain intact.
  - Run non-matching manifest invalidations against the large populated cache and require the same semantic checksum while retaining the scan control.
  - Alternate scenario order across iterations and reject non-positive iteration input so warmup or order bias cannot manufacture the result.
- **Verification:** The unified runner emits valid JSON for all three scenarios, the semantic controls pass, and the baseline large/small ordinary ratio and ordinary/control ratio both fail KTD3 by decisive margins.

### U2. Skip impossible cache invalidations

- **Goal:** Add the smallest shared-compiler fast path and regression coverage for the preserved invalidation contract.
- **Requirements:** R1, R4, R5, R6, R7, R8.
- **Dependencies:** U1.
- **Files:**
  - `packages/octane/src/compiler/bundler.js`
  - `packages/octane/tests/compiler/bundler-compiler.test.ts`
  - `.changeset/fast-manifest-cache-invalidation.md`
- **Approach:** Apply KTD1 in the owning invalidation method without changing cache shapes or adapter behavior. Extend the existing cache-refresh scenario per KTD4, including decorated manifest IDs if the public path accepts them.
- **Execution note:** Add the behavioral assertion before the fast path. Deliberately apply an over-broad skip or clear to confirm the new assertion fails, then restore the intended implementation.
- **Patterns to follow:** The current `invalidate` control flow in `packages/octane/src/compiler/bundler.js` and the temporary project fixtures in `packages/octane/tests/compiler/bundler-compiler.test.ts`.
- **Test scenarios:**
  - With a cached inherited package decision, create a nearer package manifest and invalidate an ordinary source file; the cached decision remains in force until the manifest itself is reported changed.
  - Report that new manifest with a query or hash suffix; the next transform refreshes ownership and observes the new package rule.
  - Populate both cache families, request a full invalidation without a path, and observe fresh package discovery on the next public compiler operation.
  - Produce a compiler diagnostic, invalidate an unrelated non-manifest path, and confirm the next generation may report the diagnostic again.
- **Verification:** The focused compiler suite passes in development, the new behavior-preservation test has been observed failing under a deliberate broken implementation, and the change introduces no new retained state or common transform-path work.

### U3. Make the performance result durable

- **Goal:** Register the final candidate result in the repository benchmark and release surfaces.
- **Requirements:** R2, R8, R9.
- **Dependencies:** U2.
- **Files:**
  - `benchmarks/baselines/local/manifest-cache-invalidation.json`
  - `benchmarks/baselines/ratios.json`
  - `benchmarks/README.md`
  - `packages/octane-mcp-server/src/index.js`
  - `packages/octane-mcp-server/README.md`
  - Files generated by `pnpm sync`
- **Approach:** Record the candidate baseline, add the KTD3 ratio guard, expose the suite through the established benchmark discovery surfaces, and include all relevant generated updates from repository synchronization.
- **Patterns to follow:** The benchmark registrations and MCP allowlists for `router-dispatch`, `tsrx-nesting-diagnostics`, `vite-client-assets`, and `text-type-roots`.
- **Test scenarios:**
  - Run the candidate suite through the unified runner with ratio enforcement; the ordinary path satisfies KTD3 and both semantic controls remain equal.
  - Re-run after all review edits so the reported candidate is not a stale intermediate measurement.
- **Verification:** The standalone and unified benchmark paths agree, ratio enforcement passes, repository synchronization is clean, and no generated inventory omits the new suite.

## Verification Contract

| Gate | Applies to | Done signal |
| --- | --- | --- |
| `node benchmarks/bench.mjs --quick manifest-cache-invalidation` before U2 | U1 | Baseline small/large ordinary and large manifest-control scores pass semantic checks and both comparison ratios fail KTD3. |
| Focused Vitest run for `packages/octane/tests/compiler/bundler-compiler.test.ts` | U2 | The new preservation scenario and adjacent compiler invalidation coverage pass. |
| `node benchmarks/bench.mjs --quick --ratios manifest-cache-invalidation` after U2 and after final review | U1-U3 | The large ordinary score is at most 1.5x the small ordinary score and at most 20% of the large manifest-control score; all correctness metadata passes. |
| `pnpm format:files:check` on changed paths | U1-U3 | Every authored change matches repository formatting. |
| `pnpm typecheck:files` on changed paths | U2-U3 | Compiler and test types pass with the repository toolchain. |
| `pnpm sync` | U3 | Generated outputs are current and the worktree remains explainably clean. |
| Relevant root test and typecheck gates selected by final diff | U1-U3 | No shared compiler, benchmark-runner, MCP, or package regression remains. |
| Current-head pull request CI and review | U1-U3 | Required and relevant checks pass, actionable review feedback is resolved, the live base is incorporated, and GitHub reports no merge blocker. |

## Definition of Done

- R1-R9 are satisfied and U1-U3 meet their verification outcomes.
- Baseline and final candidate results use the same harness, cache population, warmup, iteration policy, Node runtime, and machine state.
- The final candidate meets KTD3 by a margin larger than observed variance. Otherwise the target is abandoned under R3 and is not shipped.
- Manifest, full-reset, decorated-ID, and diagnostic-generation behaviors remain covered at the public compiler boundary.
- The Octane patch changeset, benchmark documentation, ratio guard, MCP discovery, and synchronized generated files are included where repository conventions require them.
- The final diff contains no experimental counters, alternate implementations, temporary benchmark probes, or abandoned-attempt code.
- The branch is refreshed against the live default branch before readiness, the worktree is clean after validation, and current-head CI is green.
