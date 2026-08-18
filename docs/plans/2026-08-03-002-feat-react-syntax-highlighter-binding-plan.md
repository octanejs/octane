---
title: "feat: Add exact react-syntax-highlighter binding"
date: 2026-08-03
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# feat: Add exact react-syntax-highlighter binding

## Goal Capsule

- **Objective:** Ship `@octanejs/syntax-highlighter` as an exact React-free binding for `react-syntax-highlighter@16.1.1`, preserving the root component variants, registration APIs, AST renderer contract, and supported published language/style/build deep imports.
- **Authority:** npm SHA-1 `928459855d375f5cfc8e646071e20d541cebcb52`, npm integrity `sha512-PjVawBGy80C6YbC5DDZJeUjBmC7skaoEUdvfFQediQHgCL7aKyVHe57SaJGfQsloGDac+gCpTfRdtxzWWKmCXA==`, source commit `ecac533ba1fce8cf4f98a79c5c913f1a7ffab34c`, the MIT license, current repository guidance, and executable React-oracle evidence govern parity in that order.
- **Execution profile:** Preserve framework-neutral lowlight, refractor, Prism, grammar, AST, and style data; re-author only React-owned rendering and async lifecycle seams; generate the high-cardinality deep-import surface from one pinned inventory.
- **Stop conditions:** Stop for license/source mismatch, a dynamic-tag/custom-renderer/async contract that Octane cannot express without a prerequisite core PR, deep-import compatibility that cannot be represented honestly, or browser/SSR evidence that contradicts the parity claim.
- **Tail ownership:** One isolated branch and one draft PR. Keep it draft through current-head checks, Cursor/Bugbot, feedback cleanup, and the explicit final readiness gate. Never merge without explicit user direction.

## Product Contract

### Problem Frame

Applications importing `react-syntax-highlighter` depend on more than highlighted colors. The observable contract includes eight root variants, AST-derived nested markup, whitespace preservation, line-number layout, custom tags and renderers, synchronous and asynchronous language registration, hundreds of language/style deep imports, SSR, and updates while asynchronous loaders are pending. An alternative highlighter or a root-only wrapper does not provide package-equivalent migration coverage.

### Requirements

#### Public package and deep-import contract

- R1. Preserve the default export plus `LightAsync`, `Light`, `PrismAsyncLight`, `PrismAsync`, `PrismLight`, `Prism`, and `createElement`, including static `registerLanguage`, `alias`, `preload`, `loadLanguage`, `isSupportedLanguage`, `isRegistered`, and `supportedLanguages` members where the pinned variant exposes them.
- R2. Preserve the documented prop surface: `language`, string children/code, inline styles, custom styles, line numbers, starting line, line-number styles, wrapping, line props, renderer, `PreTag`, `CodeTag`, code-tag props, AST generator, and native pre attributes. Record React-element/type identity differences explicitly rather than silently narrowing behavior.
- R3. Preserve every supported published `dist/esm` and `dist/cjs` build, language, style, and supported-language deep-import path through a generated, deterministic inventory. Path compatibility and actual CommonJS `require()` compatibility are separate claims and must be tested/documented separately.
- R4. Ship no React runtime dependency, no duplicate Octane runtime, and no unpublished provenance/test/audit material.

#### Highlighting and rendering behavior

- R5. Preserve Highlight.js/lowlight and Prism/refractor language selection, explicit `text`, unknown-language fallback/auto-detection, null-language fallback, aliases, and registration.
- R6. Preserve exact AST-to-DOM tag nesting, text and newline segmentation, token and non-token class names, selector permutation style merging, inline-style-disabled classes, and stable row ordering.
- R7. Preserve external and inline line numbers, starting numbers, width calculation, functional/object styles, line props, wrapping, long-line flex/white-space behavior, multiline tokens, trailing newlines, and plain-string output.
- R8. Preserve custom `PreTag`/`CodeTag`, `codeTagProps`, rest/native pre props, custom renderer row/stylesheet/input contract, and update behavior when code, language, style, renderer, or tag props change.

#### Async, server, and adoption behavior

- R9. Preserve async variant preload and language-load behavior, including plain fallback before generator availability, queued registrations, load failure fallback, rerender on success, and language changes while prior work is pending. Stale completion must not overwrite the current language.
- R10. Import and render every supported synchronous variant during SSR without DOM globals. Async variants must produce their documented deterministic pre-highlight fallback without unhandled promises or browser-only initialization.
- R11. Hydrate server markup by adopting the existing `pre`, `code`, line, and token nodes where the server/client state matches, without warnings, replacement, lost selection, or whitespace changes; subsequent prop/language updates become live.
- R12. Match React in real Chromium for DOM, computed styles, whitespace, wrapping, selection/copy text, line alignment, dynamic updates, custom tags/renderers, and async loading, with focused Firefox evidence for whitespace and wrapping behavior.

#### Evidence and repository adoption

- R13. Pin and hash the npm artifact, tagged source, license, declarations, all source/tests/snapshots/fixtures, every deep-import inventory, and every generated file; negative controls must prove missing, extra, renamed, collided, or stale entries fail closed.
- R14. Execute all 19 upstream runtime files, 51 test identities, and 18 snapshot files as pristine React evidence and one-for-one adapted Octane evidence, preserving names and assertion strength. Add paired pristine/adapted public type programs.
- R15. Register executable pristine, adapted, differential, SSR, hydration, browser, pristine-type, adapted-type, provenance, crosswalk, and packed-consumer lanes in the global parity contract without package-specific CI jobs.
- R16. Ship README/migration guidance, status, changeset, package/catalog/website/playground integration, CLI/MCP mappings, generated inventories, and outside-workspace packed consumers for representative root and deep imports.

### Key Flows

- F1. **Synchronous highlight:** A root or light variant resolves a language and renders exact AST-derived markup with the requested line/style/tag options. Covers R1-R8.
- F2. **Async highlight:** An async variant renders a deterministic fallback, loads its generator/grammar, and updates only the current request. Covers R1, R5, R9.
- F3. **Deep import migration:** Existing language/style/build imports resolve through the Octane package with identical data and registration semantics. Covers R1, R3-R5, R13.
- F4. **SSR and hydration:** Server markup is deterministic and browser-safe; Octane adopts it and supports live updates. Covers R10-R12.
- F5. **Tool-assisted migration:** CLI/MCP recognize the exact package and deep imports; packed applications build and render without React. Covers R4, R15-R16.

### Acceptance Examples

- AE1. Given identical Highlight.js and Prism fixtures with multiline comments, unknown languages, line numbers, wrapping, and custom styles, React and Octane produce equivalent DOM/class/style/text observations. Covers R5-R8, R12.
- AE2. Given a light variant with a registered grammar and alias, both runtimes highlight the same tokens; deleting one generated grammar export or alias causes inventory validation to fail. Covers R3, R5, R13.
- AE3. Given an async language switch while the first loader remains pending, completion cannot render stale tokens for the previous language; React/Octane transition logs and final DOM agree. Covers R9, R12.
- AE4. Given server markup with selected code text, hydration retains nodes, selection, whitespace, and initial markup; a later code/language update highlights the new value. Covers R10-R12.
- AE5. Given a packed external consumer importing root, Prism/light/async, representative ESM/CJS paths, grammars, and styles, resolution, `tsrx-tsc`, client build, SSR build, and executed SSR pass without React. Covers R3-R4, R15-R16.

### Scope Boundaries

- Do not substitute Shiki, Prism React Renderer, or a generic code-block component.
- Do not claim React Native support; that is a separate upstream package.
- Do not claim arbitrary private files beyond the recorded published surface.
- Do not claim CommonJS execution merely because a `dist/cjs/*` path resolves.
- Do not hand-maintain hundreds of grammar/style modules or export entries.
- Do not edit Octane core to hide a binding defect; proven core gaps become prerequisite PRs.

## Planning Contract

### Key Technical Decisions

- KTD1. **Pin npm and repository boundaries separately.** The npm artifact defines the 1,995-file published surface; source commit `ecac533b` supplies the 19 test files and 18 snapshots absent from the tarball. Governs R3, R13-R15.
- KTD2. **Generate all high-cardinality entrypoints from one canonical inventory.** Model the Lucide generator and Visx explicit export matrix: stable sorting, aliases, collisions, exact equality, and `--check` mode. Governs R3, R13, R16.
- KTD3. **Keep highlighting engines and public data framework-neutral.** Reuse lowlight/refractor/Prism, grammars, AST values, and style objects; only the React render and async lifecycle layers become Octane TSRX/hooks. Governs R4-R9.
- KTD4. **Run a feasibility gate before bulk generation.** Prove dynamic `PreTag`/`CodeTag`, recursive AST rendering, custom renderer return values, static component members, and async stale-result cancellation in minimal React/Octane fixtures. A failed gate stops before committing hundreds of generated modules. Governs R1-R2, R6, R8-R9.
- KTD5. **Treat path compatibility and module-format compatibility independently.** Preserve recorded `dist/esm/*` and `dist/cjs/*` specifiers, but require actual packed `import` and `require` evidence before claiming either execution mode. Governs R3-R4.
- KTD6. **Use exact DOM/text differentials and real browsers as rendering authority.** Snapshots prove structural parity; Chromium/Firefox prove computed layout, selection/copy, whitespace, and async updates. Governs R5-R12, R14.
- KTD7. **Fail closed through the global parity harness.** Exact upstream identities, transformations, hashes, lanes, and packed imports are executable inventory, never prose-only evidence. Governs R13-R16.

### Sequencing

Pin provenance and generate the surface inventory first. Run the U2 feasibility gate before bulk language/style generation. Implement synchronous rendering before async variants. Establish pristine/adapted/differential/type/SSR evidence before hydration/browser work. Generate deep modules only from the verified inventory, then integrate adoption surfaces and run final global/release/review gates.

### Risks and Dependencies

- Upstream `lowlight@1` and `refractor@5` expose different AST and registration APIs; exact pins and adapters must remain variant-specific.
- The npm package exposes 1,316 generated dist files across two module-format trees; missing one alias can make an apparently complete port non-migratable.
- Custom renderers may return React elements with semantics Octane cannot consume directly. The feasibility gate must define the exact reachable source/type boundary rather than accepting a silent approximation.
- Async variants use class lifecycle and shared static caches upstream. Octane must prove queued registration, stale completion, remount, and server behavior without duplicating global engines.
- Highlighted output is whitespace-sensitive. Normalize only framework markers explicitly allowed by the parity ledger.
- No institutional `docs/solutions` corpus exists on current main; current repository guidance and exemplars are the available local authority.

## Implementation Units

### U1. Pin upstream provenance and inventory the public surface

### U2. Prove the rendering and async feasibility gate

- **Requirements:** R1-R2, R6, R8-R12; KTD3-KTD4, KTD6. Depends on U1.
- **Files:** `packages/syntax-highlighter/tests/feasibility/`, initial `src/create-element.tsrx`, initial `src/async-syntax-highlighter.tsrx`, `vitest.config.js`.
- **Approach:** Build minimal same-scenario React/Octane fixtures for recursive AST tags, dynamic native/component tags, custom renderer output, static members, server fallback, hydration adoption, queued grammar registration, and two out-of-order loader completions. Stop and open a prerequisite plan if the declared surface cannot be expressed honestly.
- **Test scenarios:** Token nesting/text; custom native and component tags; renderer returning nested output; static method access; async preload/register/load/error; switch A to B before A resolves; unmount before completion; SSR import/render; hydrate identical fallback then resolve.

### U3. Port synchronous engines and renderer behavior

- **Requirements:** R1-R8; KTD3, KTD6.
- **Files:** `packages/syntax-highlighter/src/{index,highlight,create-element,default-highlight,light,prism,prism-light}.tsrx`, helpers under `src/`, adapted tests under `tests/upstream/`.
- **Approach:** Port the pinned module structure and algorithms with typed AST/data boundaries. Preserve class/style permutation, line splitting, line numbers, wrapping, tags, renderer, fallback, registration, aliases, and static supported-language members.
- **Test scenarios:** Every synchronous upstream case plus text/no/unknown language, Highlight.js auto-detect, Prism failure fallback, multiline tokens, trailing newline, custom style/class, inline styles off, all line-number modes, lineProps callbacks, wrapLines/LongLines, custom tags/renderers, and rerenders.

### U4. Port async variants and lifecycle

- **Requirements:** R1, R5, R8-R10; KTD3-KTD4.
- **Files:** `packages/syntax-highlighter/src/{async-syntax-highlighter,light-async,prism-async,prism-async-light}.tsrx`, async loader inventory/modules, async adapted/differential tests.
- **Approach:** Replace class lifecycle with Octane state/effects and explicit request generations. Preserve shared generator/language registration semantics without allowing stale promise completion or post-unmount updates.
- **Test scenarios:** All upstream async snapshots; preload; shared generator reuse; pre-registration; supported/unsupported/text languages; loader reject; concurrent language switches; remount; multiple instances; SSR fallback; hydration then resolution.

### U5. Generate and verify deep language/style/build entrypoints

- **Requirements:** R3-R5, R13; KTD1-KTD2, KTD5.
- **Files:** generated modules under `packages/syntax-highlighter/src/{languages,styles,compat}/`, package exports, generator tests, exact expected-subpath inventory.
- **Approach:** Generate leaf modules/barrels/aliases and explicit export conditions from the pinned inventory. Re-export framework-neutral grammar/style data without React. Preserve both recorded path families while testing actual ESM/CJS behavior separately.
- **Test scenarios:** Import every expected path; compare language/style values and keys to upstream; register representative grammars from each family; resolve canonical/alias paths; reject extra/missing/collision/stale output; packed `import` and supported `require` probes.

### U6. Build complete parity, type, SSR, hydration, and browser evidence

### U7. Add repository adoption and packed consumers

- **Requirements:** R4, R16; KTD7. Depends on U5-U6.
- **Files:** package README/status/changeset; CLI data/tests; MCP bridge/tests/skill; playground dependency/demo/catalog; website binding data; root package/lock/generated inventories; `scripts/{package-pack-canaries,check-package-packs}.mjs` and tests.
- **Approach:** Document exact migration and deliberate type/module-format boundaries. Add a deterministic playground comparing Highlight.js and Prism plus line/wrap/style/registration controls. Extend the outside-workspace pack canary with representative root, build, grammar, style, client, and SSR imports.
- **Test scenarios:** CLI/MCP exact rewrite including deep imports; accessible playground interaction; pack content allowlist; no React; single Octane; `tsrx-tsc`; client/SSR builds and executed SSR; generated checks reject drift.

### U8. Run final simplification, review, and draft-PR gates

- **Requirements:** R13-R16.
- **Files:** All changed files and generated outputs. The parent tracker remains outside the PR.
- **Approach:** Run package and global parity, types, provenance, crosswalk, generator check, browser, pack, formatting, generated, playground, CLI/MCP, and release gates. Simplify without weakening parity, run independent review, fix findings, update the durable tracker, push logical commits, and open only a draft PR.
- **Test scenarios:** Final head reproduces all evidence; tarball contains only intended files; worktree is clean; current-head review threads are resolved; PR remains draft until the explicit readiness gate.

## Verification Contract

| Gate | Done signal |
| --- | --- |
| Provenance and generator checks | Exact artifact/source/license/test/snapshot/deep-import hashes and deterministic outputs pass, including negative controls. |
| Pristine/adapted/differential runtime | All 51 upstream identities and authored cases execute with no skip/todo/expected-failure markers. |
| Paired type projects | Root variants, props, static members, renderer/tag contracts, and deep imports accept/reject as classified. |
| SSR/hydration/browser | No-global server safety, deterministic fallback/highlight markup, node adoption, whitespace, computed layout, selection/copy, updates, and async races match React. |
| Global React parity | Every required lane is auto-discovered, current, executable, and fail-closed. |
| Packed consumer | Representative root/build/language/style imports, no React, single Octane, client/SSR builds, and executed SSR pass outside the workspace. |
| Adoption/generated gates | CLI/MCP, playground, website, status, packages, parity gaps, eval corpus, changeset, formatting, and lockfile are current. |
| Draft PR policy | The pushed head opens as draft and remains draft through exact-head automated review and feedback cleanup. |

## Definition of Done

- Requirements R1-R16 and flows F1-F5 have direct executable or retained-provenance evidence.
- The root API and every classified published language/style/build path are generated, importable, and represented exactly once.
- All upstream runtime tests and snapshots execute pristine and one-for-one adapted, with paired public type evidence.
- SSR, hydration, Chromium, and Firefox prove the environment-dependent contracts, including async stale-result behavior.
- The packed package, migration tooling, demo, catalogs, status, changeset, and generated inventories are complete and React-free.
- No stale hash, missing/extra deep import, skipped case, weakened assertion, unpublished audit artifact, abandoned experiment, or unresolved review finding remains.
- The isolated PR exists as a draft and the durable tracker records its pin, branch, PR, evidence, and review state.
