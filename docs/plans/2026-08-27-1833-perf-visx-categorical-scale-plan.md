---
title: Visx Categorical Scale Lookup - Plan
type: perf
date: 2026-08-27
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Visx Categorical Scale Lookup - Plan

## Goal Capsule

- **Objective:** Charts with large categorical domains can assign colors across all data points without lookup time growing quadratically with the domain.
- **Means:** Reuse one first-occurrence lookup index for repeated scale calls while retaining a small-domain linear path (KTD1, KTD2).
- **Authority:** Public `@octanejs/visx` behavior and the user's performance constraints override implementation convenience. Repository performance and testing rules govern evidence quality.
- **Execution profile:** Validate the scaling premise before keeping production changes. Discard the attempt and select another recent-PR-distinct hotspot if the indexed path does not beat the current path outside observed variance.
- **Stop conditions:** Stop only after semantic parity and repeatable large-domain improvement are both proven, or after the candidate is abandoned without residual code.
- **Tail ownership:** The implementation includes the package changeset, benchmark registration, focused verification, and repository gates required for an Octane PR.

---

## Product Contract

### Summary

`@octanejs/visx` categorical color scales will reuse lookup work across repeated data-point calls. The public color selection, warning, and fallback behavior will remain unchanged.

### Problem Frame

`useCategoricalScale` and `useColorScale` call `Array#indexOf` for every key lookup. A chart that looks up each member of a large domain therefore performs a growing domain scan for every datum and trends toward quadratic work. The hooks already retain domain state across a render, so repeating the scan is avoidable.

### Requirements

**Performance**

- R1. Repeated lookups over a large categorical domain must perform sub-quadratic lookup work and show a repeatable timing improvement over the current linear-scan accessor.
- R2. Small categorical domains must retain a low-overhead path so the optimization does not merely move disproportionate work into setup.

**Behavioral compatibility**

- R3. Existing keys must resolve to the same palette position as the current first-match `indexOf` behavior, including duplicate domain values.
- R4. Missing keys must preserve the existing warning and index-zero fallback behavior in both public hooks.
- R5. Explicit ranges, theme fallback colors, and palette wrapping must keep their current results.

**Delivery constraints**

- R6. The change must start from the latest `origin/main` and must not duplicate the areas covered by the user's recent performance PRs.
- R7. Performance evidence must compare equivalent warmed workloads over multiple iterations and include semantic controls.
- R8. If the categorical-domain hypothesis fails R1 or only shifts cost without a useful large-domain win, the implementation must remove the attempt and move to another distinct hotspot.

### Scope Boundaries

- In scope: the two public Visx categorical color hooks, their shared lookup mechanism, behavioral coverage, and a focused benchmark contract.
- Out of scope: changing palette values, warning text, public types, general Visx scale behavior, or any recent compiler, runtime, app-core, Lynx, Vite, Rsbuild, and manifest-cache performance topic already covered by the user's recent PRs.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Use a first-occurrence string index for large domains.** Build a reusable lookup whose duplicate handling matches `indexOf` instead of allowing later duplicate keys to overwrite earlier positions. Governs R1 and R3.
- KTD2. **Keep a small-domain linear path.** Select the crossover from measured evidence so short domains avoid paying for an index that cannot amortize its setup. Governs R1 and R2.
- KTD3. **Share the lookup mechanism and stabilize hook inputs.** Both hooks must consume the same semantic helper, while `useStructuralMemo` and `useMemo` retain the helper and returned accessor across structurally equal inputs. Governs R1, R3, R4, and R5.
- KTD4. **Benchmark the production lookup mechanism against the prior scan.** The harness must time construction plus repeated lookups, alternate sample order, warm both paths, and fail semantic mismatches before reporting timing. Governs R1, R2, R7, and R8.

### Assumptions

- Large categorical domains with repeated point lookups are a meaningful Visx workload. Implementation must validate this assumption with a scaling benchmark before retaining the change.
- A private helper under the existing theme implementation is the smallest ownership boundary that prevents the two public hooks from drifting.
- A focused Node benchmark can isolate lookup scaling without requiring DOM layout or browser paint measurements.

### Risks and Mitigations

- **Setup or allocation regression:** A lookup index can make tiny domains slower. KTD2 requires a measured small-domain control and a low-overhead fallback.
- **Duplicate-key drift:** A naive `Map` constructor keeps the last duplicate while `indexOf` keeps the first. KTD1 and behavioral coverage require first-occurrence semantics.
- **Stale lookup state:** A retained accessor can become incorrect when domain, range, or theme changes. KTD3 requires structural domain stability and dependencies that rebuild on every behavior-bearing input change.

### Sources and Research

- `packages/visx/src/theme/react/useCategoricalScale.tsrx` performs `domain.indexOf(key)` on every accessor call and currently returns a new accessor on each render.
- `packages/visx/src/theme/react/useColorScale.tsrx` structurally stabilizes the domain but still performs `stableDomain.indexOf(key)` for every accessor call.
- `packages/visx/src/kernel/memo/useStructuralMemo.tsrx` is the existing Visx convention for retaining shallow-equal array inputs.
- `benchmarks/README.md` requires warm, multi-iteration, machine-readable results with correctness gates and noise-aware conclusions.
- The user's recent performance PRs cover compiler graph scans, generated-name growth, runtime host/form/stream work, scheduler depth, app-core routing and hydration templates, Lynx queues and handle retirement, Vite assets, Rsbuild masking, and manifest/type-root caches. The Visx theme scale path is distinct.

---

## Implementation Units

### U1. Indexed categorical lookup and hook integration

- **Goal:** Replace repeated large-domain scans in both public categorical color hooks with one shared, reusable lookup while preserving public results.
- **Requirements:** R1, R2, R3, R4, R5.
- **Dependencies:** None.
- **Files:**
  - `packages/visx/src/theme/react/categoricalIndex.ts`
  - `packages/visx/src/theme/react/useCategoricalScale.tsrx`
  - `packages/visx/src/theme/react/useColorScale.tsrx`
  - `packages/visx/tests/_fixtures/behavior.tsrx`
  - `packages/visx/tests/conformance/behavior.test.ts`
- **Approach:**
  1. Add a private first-occurrence lookup helper with a measured small-domain linear path.
  2. Reuse the helper from both hooks and retain it across structurally equal domains.
  3. Keep warning, missing-key fallback, range wrapping, and theme behavior at the public hook boundary.
- **Execution note:** Add consumer-visible semantic coverage before changing the hook lookup path, then verify a deliberately broken last-occurrence implementation fails the duplicate-key case.
- **Patterns to follow:** Use `useStructuralMemo` from `packages/visx/src/kernel/memo/useStructuralMemo.tsrx` and the existing explicit dependency-array pattern in `useColorScale.tsrx`.
- **Test scenarios:**
  - Render both public hooks with a normal domain and verify each key resolves to the same expected categorical color.
  - Render a domain with a duplicate key and verify the duplicate resolves to its first domain position.
  - Request a missing key and verify each hook returns its current index-zero fallback while emitting the existing warning.
  - Change the domain, explicit range, and active theme across updates and verify the scale reflects each new input without stale mappings.
- **Verification:** The Visx behavior suite passes with exact output and warning assertions, and the package typecheck accepts the unchanged public signatures.

### U2. Scaling benchmark and release evidence

- **Goal:** Prove the production lookup removes large-domain repeated scans without disguising setup cost or changing results.
- **Requirements:** R1, R2, R6, R7, R8.
- **Dependencies:** U1.
- **Files:**
  - `benchmarks/visx-categorical-scale/README.md`
  - `benchmarks/visx-categorical-scale/run.mjs`
  - `benchmarks/bench.mjs`
  - `benchmarks/README.md`
  - `benchmarks/baselines/ratios.json`
  - `.changeset/<generated-visx-performance-name>.md`
- **Approach:**
  1. Bundle or otherwise load the production lookup helper in a Node-only harness.
  2. Compare the prior `indexOf` accessor with the production helper at a small control and at one or more large-domain scales.
  3. Include index construction in each timed sample, perform repeated lookups, alternate scenario order, and verify identical checksums for ordinary, duplicate, and missing keys.
  4. Add a conservative same-run ratio guard only after repeated measurements establish a stable margin outside variance.
  5. Add a patch changeset for `@octanejs/visx` after the candidate passes the evidence gate.
- **Execution note:** If the large-domain result is inconclusive or the measured crossover makes the production helper unjustified, remove U1 and this benchmark attempt, then select and plan another recent-PR-distinct hotspot.
- **Patterns to follow:** Follow the machine-readable target, warmup, alternating-order, correctness-gate, and summary conventions in `benchmarks/router-dispatch/run.mjs` and `benchmarks/README.md`.
- **Test scenarios:**
  - The small-domain control returns identical checksums and demonstrates the improvement disappears where indexing should not help.
  - The large-domain scenario returns identical checksums and shows the production helper below the accepted same-run ratio against the prior scan.
  - Duplicate keys resolve to the first occurrence in both benchmark paths.
  - Missing keys produce the same sentinel result in both benchmark paths.
  - An invalid iteration count fails before recording results.
- **Verification:** The focused benchmark passes its semantic gates across repeated normal runs, the selected ratio has variance headroom, and the changeset names only `@octanejs/visx` as a patch release.

---

## Verification Contract

| Gate | Scope | Done signal |
| --- | --- | --- |
| Visx behavior | Public categorical scale outputs, duplicate handling, missing-key warnings, updates | Focused `visx` tests pass and a broken last-occurrence implementation fails the duplicate case |
| Visx types | Unchanged public hook signatures and new private helper typing | `@octanejs/visx` typecheck passes through `tsrx-tsc` |
| Performance | Small and large categorical domains with construction plus repeated lookups | Repeated warmed runs show a stable large-domain win outside variance; the small control does not claim an artificial universal win |
| Benchmark contract | Unified-runner registration, JSON, correctness metadata, ratio | The focused unified benchmark passes in quick and normal modes with its semantic gates |
| Repository quality | Formatting, generated files, package inventory, targeted tests | Relevant repository format, typecheck, and test gates pass with no unrelated changes |

---

## Definition of Done

- U1 preserves every public categorical scale result covered by R3 through R5.
- U2 demonstrates that large-domain lookup scaling is no longer quadratic and records conservative evidence through the unified benchmark system.
- The performance result is re-run after self-review changes and reports the final candidate rather than an intermediate measurement.
- The branch is based on the fetched latest `origin/main` and does not overlap the user's recent performance PR topics.
- A patch changeset covers the user-visible `@octanejs/visx` improvement.
- Focused tests, typecheck, formatting, benchmark checks, and any applicable broader repository gates pass.
- Any abandoned experiment, stale benchmark output, and dead helper code from a failed hypothesis is removed from the diff.
