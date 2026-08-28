---
title: Skip Hostless Native Change Analysis - Plan
type: perf
date: 2026-08-28
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Skip Hostless Native Change Analysis - Plan

## Goal Capsule

- **Objective:** TSRX modules without native text-entry hosts do not pay for an unconditional whole-AST native-`onChange` diagnostic walk.
- **Means:** Return an empty analysis before scope construction and traversal when authored source contains neither lowercase `input`, lowercase `textarea`, nor a backslash that could encode either intrinsic name.
- **Authority:** The user-directed latest-main, non-duplication, and measured-performance constraints take precedence, followed by compiler diagnostics and source/AST contracts, then this plan.
- **Execution profile:** Establish a paired current-main benchmark before production edits, preserve client/server/Volar/MDX behavior, and retain the change only if fixed causal and end-to-end gates pass.
- **Stop conditions:** Abandon the candidate if source and AST are not paired at every call site, if a legal or parser-recovered native host can evade the source predicate, if diagnostics or emitted bytes change, or if the performance gates fail.
- **Tail ownership:** The invoking LFG run owns implementation, review, changeset, synchronization, commit, push, PR creation, and green-CI follow-through.

---

## Product Contract

### Summary

Avoid native text-change diagnostic scope construction and recursive AST traversal for the common case where authored TSRX cannot contain a relevant native host. Prove the skipped work with structurally identical paired fixtures and preserve full compilation output.

### Problem Frame

`analyzeNativeChangeDiagnostics` currently creates lexical scopes and recursively visits every authored AST node for every client, server, Volar, and MDX compilation. The analysis can only classify lowercase DOM `<input>` and `<textarea>` hosts. Modules containing only components and other host elements therefore pay the complete walk to produce two empty collections.

The authored source is already available to the analyzer. The parser permits trivia after `<` and Unicode escapes within JSX identifiers, so an exact tag-prefix check is insufficient. However, every decoded lowercase `input` or `textarea` host must leave either that lowercase substring or a backslash escape in authored source. Absence of all three proves the AST cannot contain a relevant native host. False positives from identifiers, comments, strings, custom elements, or unrelated escapes merely retain the existing analysis. Spreads do not invalidate the predicate because they matter only when attached to an input or textarea host.

### Requirements

**Scope and behavior**

- R1. Work from the latest upstream default branch and remain distinct from the user's recent `(perf)` PRs.
- R2. Preserve diagnostics, source ranges, classifications, emitted client/server code, source maps, Volar diagnostics, and MDX diagnostics.
- R3. Retain full analysis for every source that may decode to an `input` or `textarea`, including whitespace after `<`, Unicode-escaped names, spread-only hosts, renderer boundaries, SVG/`foreignObject` namespace transitions, and malformed-but-collectable editor input.
- R4. Return fresh empty diagnostics and classification collections when `input`, `textarea`, and `\\` are all absent, before renderer-boundary analysis, scope collection, or recursive visiting.

**Performance and evidence**

- R5. Add a Node-only benchmark with small/large hostless TSRX trees and a same-byte, structurally identical large control whose ignored comment contains `<input` and forces the old walk.
- R6. On the retained candidate, large hostless direct-analysis time must be at most 15% of the forced-scan control, while client and server compile time must not regress by more than 15% against their paired controls. Current main must fail the direct-analysis ratio.
- R7. Benchmark correctness must require empty diagnostics/classifications, identical target/control AST serialization after normalizing the ignored marker-comment text, and identical target/control client/server output bytes and digests.
- R8. If the hypothesis or any gate fails, remove the attempt and continue with another non-overlapping TSRX hotspot.

**Repository integration**

- R9. Register the benchmark in the unified runner, benchmark inventory, ratio guards, local baseline evidence, and MCP benchmark allowlist.
- R10. Add a patch changeset for `octane`, run repository synchronization, and complete the relevant/full verification gates.

### Key Decisions

- **Conservative host-spelling proof rather than event-token proof** (session-settled: implementation safety). A file without `onChange` may still contain `<input {...props}>`, and parser recovery accepts trivia/escapes in host names. Absence of both lowercase host names and all escapes safely covers direct, spread-owned, and recovered cases.
- **Paired ignored-comment control** (session-settled: performance attribution). Equal-length comments make target and reference parse to identical ASTs while the reference conservatively triggers the source predicate.
- **Central analyzer fast path** (session-settled: integration parity). Keeping the proof inside `analyzeNativeChangeDiagnostics` makes compiler, Volar, and MDX callers share the same behavior.

### Success Criteria

- Current main fails and the candidate passes the direct-analysis ratio in identical conditions.
- Client/server target and control output code is byte-identical, and all existing native-change compiler, Volar, MDX, runtime, and browser tests remain green.
- A regression explicitly covers the hostless fast path and the spread-only `<input>` control.
- No recent user-authored performance PR overlaps the compiler diagnostic walk or benchmark.

### Scope Boundaries

In scope:

- `packages/octane/src/compiler/native-change-diagnostics.js` and focused tests.
- A dedicated diagnostic-analysis benchmark and its repository registration.

Out of scope:

- Changing native `change` semantics, warning policy, runtime fallback behavior, renderer ownership, JSX parsing, or general compiler traversal infrastructure.
- Event-token prefilters, because spread-owned native handlers do not contain authored `onChange` tokens.
- The recent runtime form-diagnostic queue optimization, which occurs after compilation and does not touch this analyzer.

### Acceptance Examples

- AE1. Covers R2 and R4. A large module containing components, `<main>`, `<section>`, and `<span>` but none of the conservative host-spelling signals returns fresh empty collections without visiting the AST.
- AE2. Covers R3. `<input {...props}>` retains a `runtime-check` classification even when the source has no `onChange` token.
- AE3. Covers R3. `<textarea onChange={handler}>`, `< input onChange={handler}>`, and `<\\u0069nput onChange={handler}>` retain existing classification and diagnostics.
- AE4. Covers R2 and R7. Hostless target and ignored-JSX-comment forced-scan control compile to identical client/server bytes and diagnostics.
- AE5. Covers R6. The hostless direct analysis is no more than 0.15x the same-run forced control, with no more than 1.15x client/server compile ratios.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Use conservative authored spelling signals.** Check for lowercase `input`, lowercase `textarea`, or any backslash. The parser accepts trivia after `<` and Unicode escapes in JSX names; every relevant decoded host must retain at least one signal. False positives are safe because they only retain today's path.
- KTD2. **Return fresh collections.** Do not share mutable empty arrays or maps between compilations or integrations.
- KTD3. **Keep the fallback entirely intact.** Once any conservative spelling signal is present, run renderer-region, lexical-scope, namespace, and classification logic unchanged.
- KTD4. **Benchmark analyzer and compiler together.** Direct timing makes the removed whole-tree work visible; paired full client/server compilation detects overhead or codegen divergence.

### Assumptions

- All analyzer call sites pair authored source with an AST derived from that source before user transforms that can synthesize native hosts.
- Uppercase or indirect components are not native hosts at compile time; recovered lowercase intrinsics still retain a literal lowercase host name or a backslash escape in source.
- Source false positives are acceptable and preserve correctness at the cost of only the missed optimization.
- Public documentation does not change because diagnostic behavior and output are unchanged.

### Risks and Mitigations

- **Source/AST mismatch:** Audit compiler, Volar, and MDX call sites and state the paired-authored-input contract in the fast-path comment.
- **Spread false negative:** Gate on host tags, not handler spellings, and retain a focused spread-only classification assertion.
- **Malformed editor source:** Recovered trivia spellings retain the lowercase host name, and escaped spellings retain a backslash; focused regressions cover both parser behaviors.
- **Benchmark overclaim:** Require identical AST/output digests and report direct plus end-to-end client/server results; only the direct causal ratio is expected to be dramatic.

### Sources and Research

- `packages/octane/src/compiler/native-change-diagnostics.js` owns the unconditional recursive analysis and limits classification to lowercase HTML `input`/`textarea` hosts.
- `packages/octane/src/compiler/compile.js`, `volar.js`, and `packages/mdx/src/compile.js` pass authored source with the corresponding authored JSX AST.
- `packages/octane/tests/compiler/native-change-compiler.test.ts` covers static, dynamic, spread, namespace, renderer, client/server, and Volar behavior.
- Recent user-authored PR #851 optimizes runtime form-diagnostic queue handling only; it does not touch compiler native-change analysis.

---

## Implementation Units

### U1. Establish a falsifying current-main benchmark

- **Goal:** Isolate the unconditional native-change AST walk and measure its end-to-end share.
- **Requirements:** R1, R5, R6, R7, and R8.
- **Files:** `benchmarks/tsrx-native-change-analysis/run.mjs`, its `README.md`, and plan-local JSON evidence.
- **Approach:** Parse equal-byte hostless target and forced-scan control sources once, assert identical AST serialization, alternate analysis/client/server timing order, and require identical outputs.
- **Verification:** Current main produces roughly equal target/control direct-analysis scores and therefore fails the 0.15 causal gate.

### U2. Add and regress the hostless fast path

- **Goal:** Bypass all diagnostic setup and traversal when no relevant native host is possible.
- **Requirements:** R2, R3, R4, R6, and R8.
- **Files:** `packages/octane/src/compiler/native-change-diagnostics.js` and `packages/octane/tests/compiler/native-change-compiler.test.ts`.
- **Approach:** Add the conservative spelling-signal early return, a fresh-collection hostless assertion, recovered/escaped-host regressions, and preserve the spread-only native-host assertion. Deliberately weaken/remove the predicate during red-proof verification.
- **Verification:** Focused tests and exact benchmark outputs pass; candidate performance satisfies every R6 threshold.

### U3. Register and release the measured improvement

- **Goal:** Make the proof durable and publish the compiler improvement.
- **Requirements:** R6, R9, and R10.
- **Files:** benchmark manifest/inventory/ratios/local evidence/MCP allowlist, patch changeset, and generated sync outputs.
- **Approach:** Add the suite to repository tooling, choose thresholds from paired measurements with headroom, add a precise changeset, format, synchronize, and run focused/full validation.
- **Verification:** Unified quick ratio mode passes the candidate and is known to fail current main; sync and the required test/typecheck/format gates are clean.

---

## Verification Contract

| Gate | Command | Proves |
| --- | --- | --- |
| Native-change compiler | `./node_modules/.bin/vitest run packages/octane/tests/compiler/native-change-compiler.test.ts --reporter=verbose` | Static/runtime classifications, diagnostics, renderer ownership, client/server, and Volar behavior |
| MDX diagnostics | `./node_modules/.bin/vitest run packages/mdx/tests/compile.test.ts packages/mdx/tests/vite.test.ts --reporter=verbose` | Shared analyzer integration preserves authored warning behavior |
| Focused benchmark | `node benchmarks/tsrx-native-change-analysis/run.mjs 7` | Paired AST/output correctness and analysis/client/server timing |
| Unified ratio gate | `node benchmarks/bench.mjs --quick --ratios tsrx-native-change-analysis` | Registered causal threshold passes |
| Scoped typecheck | `pnpm typecheck:files packages/octane/tests/compiler/native-change-compiler.test.ts` | Changed test surface remains typed |
| Scoped formatting | `CI=true pnpm format:files:check packages/octane/src/compiler/native-change-diagnostics.js packages/octane/tests/compiler/native-change-compiler.test.ts benchmarks/tsrx-native-change-analysis benchmarks/bench.mjs benchmarks/README.md benchmarks/baselines/ratios.json packages/octane-mcp-server/src/index.js` | Changed artifacts match repository formatting |
| Generated synchronization | `pnpm sync` | Generated inventories are current |
| Full repository tests | `pnpm test` | Compiler and integrations remain intact |
| Full repository typecheck | `pnpm typecheck` | Public and internal types remain valid |

Performance evidence must report same-run analysis, client, and server ratios, target/control source and AST equality, output digests, variance, and the current-main/candidate comparison.

---

## Definition of Done

- R1 through R10 are satisfied and traceable to U1 through U3.
- Latest-main and candidate evidence is reproducible and preserves exact output.
- The hostless proof is documented at the code boundary and every literal, recovered, or escaped native input/textarea retains the existing path.
- Ratio guards separate the candidate from current main with reasonable noise headroom.
- A patch changeset states only the measured compiler analysis improvement.
- Recent user-authored `(perf)` PRs have been rechecked immediately before shipping.
- No falsified hypothesis, instrumentation, or abandoned branch content appears in the final diff.
- The branch is pushed, opened as a PR, and watched until relevant CI is green.
