---
title: Ink Cursor-Only Update Performance - Plan
type: perf
date: 2026-08-28
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Ink Cursor-Only Update Performance - Plan

## Goal Capsule

- **Objective:** Moving Ink's terminal cursor over an unchanged frame must not repeat the already-completed line split or allocate another line array.
- **Means:** Resolve the same-output cursor-only branch before splitting the output into lines, using the already-retained line state for cursor geometry.
- **Authority:** The user request controls scope; Ink's emitted terminal bytes and existing package tests control compatibility; current `origin/main` controls the implementation baseline.
- **Execution profile:** Make one binding-local branch-ordering change, prove byte-for-byte equivalence against the exact previous cursor-only branch, and ship it through the repository benchmark and release gates.
- **Stop conditions:** If the fixed benchmark does not show a material, repeatable win without moving work into setup or changed-output rendering, terminate this candidate and remove the attempt. Do not weaken the gate or ship benchmark-only code.
- **Tail ownership:** The autonomous pipeline owns review fixes, the pull request, and CI through a decided result.

---

## Product Contract

### Summary

Remove the redundant whole-frame line split from cursor-only updates in both standard and incremental Ink rendering modes, while retaining Ink's unavoidable equal-string comparison when the caller materializes a fresh but equal frame.

### Problem Frame

`packages/ink/src/log-update.ts` splits every rendered string before checking whether only the cursor moved. In the cursor-only branch the output is identical to the retained previous frame, and both renderers already retain its line count or line array. The newly allocated line array is therefore discarded without being read for any content comparison. Ink's cursor API is used for interactive composition and IME positioning, so repeated cursor movements over a large terminal frame pay avoidable whole-frame scans.

The candidate does not overlap recent performance pull requests opened by `jonkwheeler`, and the only prior Ink pull request from that author is the original binding port.

### Requirements

**Cursor behavior**

- R1. Standard and incremental renderers must emit exactly the same terminal bytes for cursor-only updates as before, including cursor show, hide, and reposition sequences.
- R2. Cursor-only updates over output with and without a trailing newline must use the retained visible-line count.
- R3. After a dirty cursor render, the first clean render over unchanged output must hide and return the cursor and report a render; the following clean render must write nothing and return `false`.
- R4. Changed output must continue splitting and diffing normally; the optimization must not shift work into initial or content-changing renders.

**Performance proof**

- R5. The benchmark must compare production behavior with the exact previous cursor-only branch in the same process and byte-compare every emitted sequence before timing.
- R6. For 80 cursor-only updates over freshly materialized but equal copies of a fixed 20,000-line, approximately 1 MB frame, each production mode must measure at no more than 0.35 times its previous branch and save at least 10 milliseconds per sample in quick and normal runs.
- R7. A 32-line control must remain visible. A separate production-only batch of 20,000 alternating cursor updates over stable 20,000-line and 80,000-line frames must take at least 1 millisecond per sample and keep stress time per update within 2 times the representative value. Instrumented semantic runs must prove zero cursor-only newline splits for production and one per update for the previous branch.
- R8. Initial and content-changing renders must retain exactly one newline split. At 20,000 lines their production score may be no more than 1.25 times the previous branch and no more than 1 millisecond slower.

**Repository integration**

- R9. The change must remain private to `@octanejs/ink`, with no public export or API change.
- R10. The release record must describe the cursor-only rendering improvement as a patch change to `@octanejs/ink`.

### Success Criteria

- Existing Ink runtime, differential, render-to-string, host-driver, and type evidence remains green.
- Focused tests pin cursor-only output for standard and incremental modes, including trailing-newline geometry.
- The benchmark passes semantic byte gates, R6 relative and absolute materiality, R7 split/scaling gates, and R8 work-shifting controls in quick and normal runs.
- Initial and changed-output benchmark controls satisfy R8's split counts and timing ceilings.
- The final diff contains no Waypoint experiment or unrelated cleanup.

### Scope Boundaries

#### In Scope

- The cursor-only branch ordering and visible-line-count calculation in `packages/ink/src/log-update.ts`.
- Focused internal regression coverage for standard and incremental log-update behavior.
- A Node-only same-process benchmark, ratio guards, benchmark documentation, and a package changeset.

#### Deferred to Follow-Up Work

- Changing incremental line-diffing for content updates.
- Altering cursor escape sequences, public cursor APIs, or Ink component behavior.
- Optimizing ANSI tokenization or unrelated terminal output paths.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Take the cursor-only branch before line splitting.** Both renderers can calculate the visible line count from retained state when `str === previousOutput`; only changed output needs a fresh split. Because create, clear, reset, and done retain zero lines with `previousOutput === ''` while `''.split('\n')` historically produced one visible line, the retained calculation must explicitly preserve that empty-frame geometry.
- KTD2. **Benchmark the real production renderer against an embedded previous cursor branch.** Drive both with the same fake writable stream, alternate sample order, and byte-compare standard, incremental, trailing-newline, cursor-hide, and no-op sequences before timing.
- KTD3. **Keep timing, split counts, and scaling assertions in the benchmark system.** Unit tests pin emitted behavior; instrumented benchmark controls count newline splits outside timing, while uninstrumented samples own materiality and growth per `.agents/memories/testing.md`.
- KTD4. **Keep the representative and stress claims separate.** The 20,000-line freshly materialized frame models Ink's current caller and proves the removed split is material despite the remaining linear equality comparison. Stable 20,000-line and 80,000-line frames isolate cursor-branch scaling only; 80,000 lines are stress evidence, not a representative application claim.

### Assumptions

- The implementation branch started exactly at fetched `origin/main` commit `af7b5a9f6017d92baa330199e534e007a1a0cad1`; immediately before shipping it must refresh from the then-live `origin/main` and record the final base SHA.
- An exploratory current-source probe measured 80 updates over 20,000 lines at roughly 20-26 ms in both modes, while the cursor escape-sequence floor was roughly 0.03 ms; the benchmark must reproduce this on the final code instead of relying on the probe.
- A temporary esbuild bundle is the established way for a Node-only benchmark to execute TypeScript source whose authored imports use published `.js` specifiers.
- The recent performance-PR screen was current on 2026-08-28; recheck before shipping.

### Research and Patterns

- `packages/ink/src/log-update.ts` owns both standard and incremental update branches and retains `previousLineCount` or `previousLines`.
- `packages/ink/src/cursor-helpers.ts` owns the escape-sequence contract and makes byte comparison deterministic.
- `packages/ink/tests/interactive-render.test.ts` demonstrates the package's fake writable-stream shape.
- `benchmarks/floating-tree-navigation/run.mjs` demonstrates exact previous behavior, alternating samples, timing stats, and ratio-backed claims.
- `benchmarks/behavior-root-events/run.mjs` demonstrates temporary production bundling for Node-only source execution.

### Risks and Mitigations

- **Empty/trailing-newline off-by-one:** Reusing stored line count must still exclude a trailing empty split element and must preserve the historical one visible line for an empty dirty-cursor frame after create, clear, reset, and done. Test and benchmark all of these states.
- **Cursor state drift:** The branch must update `previousCursorPosition` and `cursorWasShown` exactly as before. Byte-gate show, move, hide, and repeated-clean render transitions.
- **Work shifting:** Moving the split cannot make changed-output rendering repeat it elsewhere. Benchmark initial/change controls and inspect the source path.
- **Timing noise:** The representative sample batches 80 fresh-equal updates and requires both a relative and 10 ms absolute win. The production scaling batch uses 20,000 alternating positions and must exceed 1 ms; the small control is diagnostic, not materiality evidence.

---

## Implementation Units

### U1. Skip unchanged-output line splitting

- **Goal:** Preserve terminal output while resolving cursor-only renders from retained line state.
- **Requirements:** R1-R4, R9
- **Dependencies:** None
- **Files:**
  - `packages/ink/src/log-update.ts`
  - `packages/ink/tests/log-update.test.ts`
- **Approach:**
  1. Add focused characterization for standard and incremental cursor-only updates, both trailing-newline shapes, cursor hiding, and unchanged clean no-op behavior.
  2. Move each cursor-only branch ahead of the corresponding `split('\n')`.
  3. Calculate visible lines from retained line count/array and the unchanged string, preserving the zero-retained-line empty-frame special case.
- **Execution note:** Establish byte-for-byte characterization on the previous source before changing branch order.
- **Patterns to follow:** Stream construction in `packages/ink/tests/interactive-render.test.ts`; existing cursor state transitions in `packages/ink/src/log-update.ts`.
- **Test scenarios:**
  - Standard and incremental modes emit identical initial and cursor-only sequences for a multi-line frame.
  - A trailing newline produces the same cursor coordinates and escape bytes.
  - A dirty cursor over `''` immediately after create, clear, reset, and done preserves the previous one-visible-line escape bytes.
  - After a cursor is shown, the first clean unchanged render hides/returns it and returns `true`; `willRender` agrees, and the following clean render writes nothing and returns `false`.
  - A content-changing render still emits the expected updated content in both modes.
- **Verification:** Focused Ink tests pass before and after implementation, and source inspection confirms no `split` executes before a same-output cursor-only return.

### U2. Add a cursor-update scaling benchmark

- **Goal:** Prove the removed split is material and that the cursor-only branch itself no longer adds frame-size-proportional line-array work beyond the caller's unavoidable equality comparison.
- **Requirements:** R4-R8
- **Dependencies:** U1
- **Files:**
  - `benchmarks/ink-cursor-update/README.md`
  - `benchmarks/ink-cursor-update/run.mjs`
  - `benchmarks/bench.mjs`
  - `benchmarks/README.md`
  - `benchmarks/baselines/ratios.json`
  - `benchmarks/baselines/local/ink-cursor-update.json`
- **Approach:**
  1. Bundle the current production log-update helper to a temporary Node ESM module outside the timed section.
  2. Embed the exact prior cursor-only branch and byte-gate both modes and state transitions against production.
  3. For the representative comparison, pre-materialize 80 distinct-but-equal frame strings outside timing, alternate two valid cursor positions, construct equally seeded fresh renderers per sample, and assert exactly 80 successful renders and writes.
  4. Run the 32-line control, the separate 20,000-update production scaling batch, and instrumented split counts outside timing. Report cursor-only, initial-render, and changed-render timing separately; enforce R6-R8 and record a local baseline.
- **Execution note:** If R6, R7, or R8 fails after reasonable reruns, reject and remove this candidate rather than weakening thresholds.
- **Patterns to follow:** `benchmarks/floating-tree-navigation/run.mjs`, `benchmarks/behavior-root-events/run.mjs`, `benchmarks/lib/stats.mjs`, and existing ratio entries.
- **Test scenarios:**
  - Previous and production streams emit identical bytes for all semantic controls before timing.
  - The 32-line control remains correct without being used for materiality.
  - Both modes satisfy R6 at 20,000 lines in quick and normal runs.
  - Both modes' stable-frame scaling samples exceed 1 millisecond at 20,000 and 80,000 lines, satisfy R7's normalized-growth gate, and perform zero instrumented cursor-only splits.
  - Initial and changed renders perform exactly one split and satisfy R8's relative and absolute ceilings.
- **Verification:** Direct and unified quick/normal runs emit valid JSON, ratio guards pass, and the local baseline records current-head evidence.

### U3. Integrate release and generated state

- **Goal:** Publish the improvement with the repository's required release and generated artifacts.
- **Requirements:** R10
- **Dependencies:** U1, U2
- **Files:**
  - `.changeset/<generated-ink-cursor-performance-name>.md`
  - Generated files changed by `pnpm sync`
- **Approach:** Add a patch changeset for `@octanejs/ink`, run repository sync, and retain only causal generated changes.
- **Test scenarios:** Test expectation: none -- this unit records and synchronizes already-proven behavior without runtime logic.
- **Verification:** The changeset names only `@octanejs/ink`, `pnpm sync` succeeds, and no unrelated generated drift remains.

---

## Verification Contract

| Gate | Scope | Required outcome |
| --- | --- | --- |
| Focused regression | `packages/ink/tests/log-update.test.ts` | Cursor-only, newline, hide, no-op, and changed-output behavior passes in both modes. |
| Ink package evidence | `@octanejs/ink` tests and typecheck | Runtime and differential tests pass with no public surface change. |
| Quick benchmark ratio | `ink-cursor-update` unified runner | Semantic byte controls and fixed R6-R8 thresholds pass. |
| Normal benchmark and record | `ink-cursor-update` unified runner | R6-R8 pass under normal iterations and current-head local baseline records. |
| Scoped formatting/typecheck | All changed source and tests | No formatting or type errors. |
| Repository sync | Whole generated contract | Sync succeeds and only causal changes remain. |
| Current-head CI | Open pull request | All required checks decide green after fixes and base refreshes. |

The performance audit must report final previous/production scores for both modes, relative and absolute representative deltas, stress normalized growth, sample variance, small control, deterministic split counts, and R8 initial/changed-render controls.

---

## Definition of Done

- U1-U3 satisfy all cited requirements with no unresolved implementation blocker.
- Immediately before shipping, the branch is refreshed from live `origin/main`, its final base SHA is recorded, and no recent performance PR duplicates Ink cursor-only rendering.
- R6 relative and absolute thresholds, R7 split/scaling thresholds, and R8 work-shifting controls pass after final self-review, with semantic byte controls green.
- Existing Ink package evidence remains green and public exports are unchanged.
- The patch changeset and synchronized generated state are committed.
- All Waypoint experiment files, temporary probes, build directories, benchmark scratch output, and disproven code are absent from the diff.
- Review findings are fixed or durably handed off according to the autonomous pipeline contract.
- The pull request is open and its required CI reaches a green decided result.
