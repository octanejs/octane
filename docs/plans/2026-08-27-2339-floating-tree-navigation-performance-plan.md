---
title: Floating Tree Navigation Performance - Plan
type: perf
date: 2026-08-27
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Floating Tree Navigation Performance - Plan

## Goal Capsule

Make `@octanejs/floating-ui` resolve the deepest open node in a nested floating tree without repeatedly walking the same descendants. The result must be measurably faster on representative deep and branching trees, preserve the existing tree-order and open-state semantics used by virtual list navigation, and avoid the performance areas already covered by the author's recent `(perf)` pull requests.

---

## Product Contract

### Summary

`getDeepestNode()` currently asks `getNodeChildren()` for every descendant of the current node, then recursively repeats that all-descendant search for each returned node. Descendant subtrees are therefore revisited many times. `useListNavigation()` invokes this helper in its virtual nested-menu keyboard path before routing navigation to the active deepest open node. Build direct-child relationships once and traverse eligible nodes once so lookup cost follows the tree size rather than the number of repeatedly expanded descendant paths.

### Problem Frame

- The source-owned hotspot is `packages/floating-ui/src/utils/index.ts`; the user-visible caller is `packages/floating-ui/src/useListNavigation.ts`.
- The implementation is adapted from the pinned `@floating-ui/react@0.27.19` source under `packages/floating-ui/upstream/`. The vendored upstream snapshot is provenance and must not be edited.
- A recent pull-request audit found open or recently merged performance work in Radix collection ordering, Visx categorical scales, Lynx handle retirement/commit drain, scheduler depth prefixes, manifest scanning, compiler reachability and memo witnesses, text roots, form diagnostics, list upgrades, JSX return analysis, Vite assets, router dispatch, component hoisting, Rspack/Rsbuild messaging, host-prop sorting, TSRX diagnostics, stream boundary scanning, generated names, and hydration templates. Floating UI tree navigation is a distinct owner and execution path.
- The hypothesis is load-bearing: if an exact-old-versus-candidate benchmark does not show a useful scaling improvement without a material small-tree regression, discard the attempt and select a different hotspot rather than shipping speculative churn.

### Requirements

- R1. Replace repeated all-descendant expansion in `getDeepestNode()` with a direct-child index and a single traversal of eligible open descendants.
- R2. Preserve existing results for root-only trees, closed branches, multiple branches of equal depth, missing roots, and the current first-in-tree-order tie behavior.
- R3. Preserve the caller contract in `useListNavigation()` and add no public package API.
- R4. Commit a deterministic benchmark that compares the exact former algorithm with the production candidate, checks result equivalence, and guards representative scaling ratios.
- R5. Measure the unmodified baseline before accepting the implementation. If the benchmark disproves the hypothesis or exposes a meaningful small-input regression, remove the attempt and move to another target.
- R6. Keep the pinned upstream source and provenance metadata unchanged; the optimization belongs only in the adapted Octane package source.
- R7. Add a patch changeset for the user-facing `@octanejs/floating-ui` performance improvement.
- R8. Start from the latest `origin/main` in the dedicated `/private/tmp/octane-perf-Texa6w` worktree and do not reuse or overwrite unrelated checkout state.

### Scope Boundaries

In scope:

- The internal Floating UI node helper used by virtual nested list navigation.
- A production-importing deterministic benchmark, benchmark registration, ratio baseline, documentation, focused correctness coverage, and package release metadata.
- Existing Floating UI package, parity, formatting, type, synchronization, and CI gates.

Out of scope:

- Changes to Floating UI behavior, keyboard semantics, dynamic-child divergence policy, or public exports.
- General rewrites of `getNodeChildren()`, `getNodeAncestors()`, `useListNavigation()`, or other tree consumers unless measurement proves they are required for this hotspot.
- Changes to the vendored upstream tree or any performance topic covered by the author's audited recent pull requests.

### Success Criteria

- The benchmark demonstrates linear-style traversal work and a useful elapsed-time improvement on representative deep and branching trees versus the exact former implementation.
- Candidate and former implementations return the same node identity for every deterministic correctness fixture.
- Small/root-only inputs show no material regression beyond benchmark tolerance.
- Focused Floating UI tests, relevant parity tests, scoped typechecks, repository synchronization, and required CI checks pass.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Extract the private node-tree helpers to `packages/floating-ui/src/utils/nodes.ts` and re-export them from `packages/floating-ui/src/utils/index.ts`. This mirrors the pinned upstream organization, keeps import sites stable, and lets the Node 22 benchmark import the production TypeScript helper directly without adding a public package export.
- KTD2. Construct a `parentId -> direct children` index in input order, then walk only open direct children while tracking depth. Use an iterative traversal to avoid both repeated subtree expansion and call-stack growth on deeply nested menus.
- KTD3. Preserve deterministic ties by visiting children in the same depth-first tree order as the former recursion and updating the result only at a strictly greater depth. Preserve first-match node identity where duplicate IDs are encountered rather than silently redefining malformed-tree behavior.
- KTD4. Put performance assertions in the repository benchmark/ratio system, not in an ordinary correctness test. The benchmark will retain the former algorithm as a local reference oracle, validate output identity before timing, and use deterministic node-inspection counts as the primary scaling proof. Timing samples will warm both implementations, alternate execution order, and use the repository's summary helpers so JIT order and single-sample noise cannot decide the gate.
- KTD5. Treat benchmark validation as a decision gate. An implementation that does not satisfy the evidence thresholds is abandoned without leaving helper extraction, dead benchmark code, or a changeset behind.

### Assumptions

- Floating tree node IDs are normally unique, as expected by the package APIs; compatibility handling for duplicate IDs is retained because the existing helper implicitly chooses the first matching node.
- The representative risk is virtual navigation through deeply nested or substantially branching open menus, not a change in render or scheduler behavior.
- Node 22.22.2 or later is available, matching the package engine requirement and supporting direct type-stripped import of the isolated TypeScript helper.
- Additive benchmark registry edits may need a straightforward rebase if another open performance pull request lands first; this does not create product-scope overlap.

### Research

- Repository source and comments are authoritative. `packages/floating-ui/src/utils/index.ts` exposes the repeated descendant expansion; `packages/floating-ui/src/useListNavigation.ts` shows the keyboard-navigation call site.
- `packages/floating-ui/UPSTREAM.md` pins `@floating-ui/react@0.27.19`, and `packages/floating-ui/upstream/packages/react/src/utils/nodes.ts` confirms the inherited algorithm and provenance.
- `docs/react-parity-testing.md` and `docs/differences-from-react.md` define the binding and Octane divergence constraints. No external research is load-bearing because the optimization is internal and semantics are locally pinned.
- `.agents/memories/testing.md` requires deterministic benchmarks/ratio guards for optimization claims and behavior-boundary tests for correctness.
- No applicable prior solution document or requirements-only plan exists for this hotspot.

---

## Implementation Units

### Unit 1: Prove the hotspot and establish a regression guard

Files:

- `benchmarks/floating-tree-navigation/run.mjs`
- `benchmarks/floating-tree-navigation/README.md`
- `benchmarks/bench.mjs`
- `benchmarks/README.md`
- `benchmarks/baselines/ratios.json`
- `packages/octane-mcp-server/src/index.js`
- `packages/octane-mcp-server/README.md`

Work:

- Add deterministic root-only, closed-branch, equal-depth, missing-root, deep-chain, and branching-tree fixtures.
- Embed the exact former helper as the comparison oracle and import the production helper from `packages/floating-ui/src/utils/nodes.ts` once Unit 2 creates it.
- Validate node identity before timing either implementation.
- Instrument equivalent node inspections in both implementations and make that deterministic count the primary scaling guard.
- Warm both implementations, alternate candidate/reference order across samples, and record summarized elapsed-time ratios at quick and full sizes; choose timing thresholds from repeated local baseline runs rather than a single favorable sample.
- Register and document the suite through the same benchmark and MCP inventory surfaces as other deterministic performance suites.

Decision gate:

- First run the comparison with an isolated candidate implementation and the current production algorithm. Continue only if representative deep/branching inputs show a useful improvement and root-only/small inputs stay within an acceptable tolerance. Otherwise delete the experiment and return to hotspot selection.

### Unit 2: Make deepest-node lookup single-pass

Files:

- `packages/floating-ui/src/utils/nodes.ts`
- `packages/floating-ui/src/utils/index.ts`
- `packages/floating-ui/src/useListNavigation.ts`
- `packages/floating-ui/tests/components.test.ts`
- `benchmarks/floating-tree-navigation/run.mjs`

Work:

- Move the existing private node-tree helpers into the focused module and retain the current barrel exports so callers do not change contracts.
- Implement `getDeepestNode()` with an input-order direct-child index and iterative depth-first traversal of open nodes.
- Keep the root fallback, closed-subtree exclusion, first-deepest tie choice, missing-root behavior, and first-match identity semantics explicit in the implementation.
- Add or extend a focused package test only where a realistic nested-navigation behavior boundary is not already covered. Do not use an implementation-detail unit test as the performance proof.
- Re-run the deterministic comparison and tune only the minimal data structure needed to pass the evidence gate.

### Unit 3: Preserve binding evidence and release quality

Files:

- `packages/floating-ui/tests/upstream-original.test.ts`
- `packages/floating-ui/tests/adapted-original.test.ts`
- `packages/floating-ui/tests/adapted-divergences.test.ts`
- `packages/floating-ui/tests/differential/parity.test.ts`
- `packages/floating-ui/tests/browser/positioning.browser.test.ts`
- `packages/floating-ui/audit/**`
- `.changeset/<generated-performance-name>.md`

Work:

- Run the existing upstream, adapted, differential, and browser parity lanes relevant to virtual nested list navigation; do not convert documented expected failures merely to make the optimization look covered.
- Regenerate or update evidence only if the repository parity tooling requires it; avoid unrelated snapshot churn.
- Add a patch changeset describing the faster nested Floating UI navigation lookup.
- Run scoped formatting, type checks, synchronization, tests, and then current-head CI through the LFG shipping tail.

---

## Verification Contract

### Performance and correctness evidence

- `node benchmarks/floating-tree-navigation/run.mjs 3`
- `node benchmarks/bench.mjs --quick --ratios floating-tree-navigation`
- `node benchmarks/bench.mjs --ratios floating-tree-navigation`
- Confirm all oracle fixtures return the same node object under former and production implementations.
- Confirm full-size deep-chain and branching ratios meet the committed guard and root-only/small ratios remain within the accepted tolerance.

### Package and parity evidence

- `pnpm vitest run --project floating-ui packages/floating-ui/tests/nodes.test.ts`
- Run the repository-provided Floating UI upstream, adapted, differential, and browser parity commands discovered during implementation for the virtual nested-navigation scope.
- `pnpm --filter @octanejs/floating-ui typecheck`
- `pnpm typecheck:files packages/floating-ui benchmarks/floating-tree-navigation packages/octane-mcp-server`

### Repository gates

- `pnpm format:files:check packages/floating-ui benchmarks/floating-tree-navigation benchmarks/bench.mjs benchmarks/README.md benchmarks/baselines/ratios.json packages/octane-mcp-server .changeset`
- `pnpm sync`
- `pnpm test`
- Verify `git diff --check`, generated inventories, changeset status, and current-head CI after rebasing onto the latest default branch immediately before push if `origin/main` advanced.

### Manual behavior check

- Exercise a nested virtual menu with multiple open and closed branches. Home/End and directional navigation must continue targeting the same deepest open menu as before, including equal-depth branch ties.

---

## Definition of Done

- The measured hypothesis passes the benchmark gate; otherwise this plan is abandoned and no experimental residue remains.
- `getDeepestNode()` visits eligible tree relationships once instead of recursively expanding all descendants at every level.
- Existing node identity, open-state, tree-order, and keyboard-navigation behavior is preserved.
- The deterministic suite is registered, documented, reproducible, and guarded by committed ratios.
- The pinned upstream snapshot remains unchanged and binding evidence remains truthful.
- A patch changeset exists for `@octanejs/floating-ui`.
- The branch is based on the latest default branch, does not duplicate the author's recent performance PRs, and has no unrelated worktree changes.
- The pull request is created with required branding and summary markers, review findings are resolved or durably tracked, and all relevant current-head CI checks are green.
