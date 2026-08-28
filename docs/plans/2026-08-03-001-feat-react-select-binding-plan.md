---
title: React Select binding port
date: 2026-08-03
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# React Select binding port

## Goal Capsule

- **Objective:** Publish `@octanejs/select` as an exact Octane runtime binding for `react-select@5.10.2`, with consumer-compiled public types and explicit Octane renderer type adaptations.
- **Authority:** The pinned upstream package, source, tests, and observable React behavior define parity. Octane repository guidance defines evidence and packaging requirements.
- **Execution profile:** One binding on one isolated branch and pull request, using the merged Transition Group prerequisite.
- **Stop condition:** A required behavior needs an Octane runtime, compiler, SSR, or shared parity-harness change outside this package. Such work becomes a separate prerequisite pull request.
- **Tail ownership:** The pull request opens as draft. It remains draft until lightweight checks and current-head automated review are clean, then moves ready for full CI. Maintainers own merge approval.

## Product Contract

### Summary

React users should be able to replace `react-select` imports with `@octanejs/select` without selecting a similar component library or rewriting their select behavior. The binding preserves the root, `base`, `async`, `animated`, `creatable`, and `async-creatable` entry points from `react-select@5.10.2`.

### Problem Frame

React Select is a common application dependency with a large consumer-visible contract. Migration requires more than a select-shaped control. Consumers rely on state management, async loading, option creation, component replacement, styles, accessibility, keyboard and pointer behavior, portals, scrolling, forms, CSP nonces, imperative methods, and public generic types. Octane needs an evidence-backed port of that exact contract.

### Requirements

- R1. Export all six JavaScript entry points and all 20 runtime exports from the pinned package with equivalent import intent.
- R2. Preserve consumer-compiled public generic prop, callback, action metadata, style, component-replacement, and imperative-instance contracts across every entry point, recording OctaneNode, native-event, and renderer-owned style substitutions as explicit adaptations.
- R3. Preserve controlled and uncontrolled value, input, and menu state behavior, including defaults, callback actions, focus, clear, removal, and form integration.
- R4. Preserve option categorization, filtering, formatting, selection, keyboard, pointer, touch, accessibility, live-region, menu placement, scrolling, and portal behavior.
- R5. Preserve asynchronous loading, caching, stale-request suppression, default options, loading notices, and replacement of the focused option set.
- R6. Preserve creatable-option validation, placement, metadata, delegated creation, and the composed Async Creatable contract.
- R7. Preserve animated component behavior through the exact `@octanejs/transition-group` prerequisite without requiring React at runtime.
- R8. Preserve styling, theming, CSP nonce, component overrides, and Emotion-compatible serialized output at consumer-observable boundaries.
- R9. Record the exact upstream version, commit, source and test boundary, license, published entry points, runtime exports, and integrity hashes.
- R10. Back every parity claim with executable SSR, Chromium, differential, runtime, or paired type evidence, with fail-closed inventories and crosswalks.
- R11. Integrate package metadata, status, generated documentation, the repository parity manifest, and a patch changeset without unrelated drift.

### Scope Boundaries

- This work ports `react-select@5.10.2`. It does not substitute a headless select, native `<select>`, or a different design-system component.
- Browser layout and CSS rendering are evidence inputs only where upstream behavior observes them, such as menu placement, scroll, portal coordinates, or transition lifecycle.
- Private React component instances and renderer internals are not compatibility promises. Public `SelectInstance` methods and observable refs are compatibility promises.
- Framework or shared-harness defects remain separate prerequisite pull requests.

### Acceptance Examples

- AE1. Given identical options and interactions, the React and Octane controls produce equivalent values, action metadata, focus state, menu state, accessibility markup, and form output.
- AE2. Given overlapping async requests, only the newest eligible result replaces the menu and a stale focused option cannot be selected.
- AE3. Given a valid new input, Creatable and Async Creatable expose and select the same create option with the same action metadata as React.
- AE4. Given a portal near a viewport edge, the menu flips, positions, scrolls, and restores document state like the React implementation.
- AE5. Given component, style, theme, nonce, or animated overrides, the same public replacement and composition points execute without a React runtime dependency.
- AE6. Given a consumer ref, every documented `SelectInstance` method is present and produces the same public action as its React counterpart.

## Planning Contract

### Key Technical Decisions

- KTD1. **Exact package compatibility.** Port React Select rather than recommend a similar Octane select component. (session-settled: user-directed — chosen over similar alternatives: package.json migration needs a direct equivalent.)
- KTD2. **One binding per pull request.** Keep React Select isolated on its own branch and pull request. (session-settled: user-directed — chosen over bundled ports: each binding needs independent review and status.)
- KTD3. **Pinned executable parity.** Pin `react-select@5.10.2` at commit `052e864b4990a67c4ee416851c34d1eb7b58267b`, retain MIT provenance, and use executable React/Octane evidence. (session-settled: user-directed — chosen over ad hoc compatibility claims: every port follows current repository parity guidance.)
- KTD4. **Transition Group is an explicit prerequisite.** Implement the animated entry point with the merged `@octanejs/transition-group` binding.
- KTD5. **Consumer-observable adaptation.** Recreate React lifecycle and state semantics with Octane state, refs, effects, context, and descriptors. Do not emulate private React internals.
- KTD6. **Draft-first shipping gate.** Open the pull request as draft. Promote it only after lightweight checks and current-head automated review are clean. Return it to draft after any full-CI failure and repeat the gate on the new head. (session-settled: user-directed — chosen over immediately ready pull requests: automated review must evaluate the actual head before full review.)
- KTD7. **Fail-closed public surface and evidence.** Cross-check all entry points, runtime exports, type fixtures, vendored hashes, and collected test identities so missing evidence fails validation.

### Sequencing

U1 establishes immutable provenance and package boundaries. U2 ports the core control and public types. U3 adds state-managed, async, creatable, and animated compositions. U4 proves browser and server behavior. U5 closes fail-closed evidence and repository integration. U6 owns review corrections and the draft-first shipping lifecycle.

### Risks and Dependencies

- React Select combines DOM measurement, browser scrolling, portals, focus, touch, and asynchronous state. Node-only tests cannot prove these contracts.
- Public TypeScript compatibility is structurally broad. Paired fixtures alone can accept independently incompatible declarations, so exact compatibility assertions cover shared pure types and selected non-renderer members; renderer-owned substitutions are explicit, fail-closed adaptations rather than hidden exactness claims.
- Scroll locking is global state. Multiple mounted selects must preserve the first document-style snapshot until the final lock releases.
- Async option replacement can invalidate focused object identity. Focus reconciliation must not allow Enter to select stale data.
- The animated entry point depends on the `@octanejs/transition-group` binding now available on the target branch.

## Implementation Units

### U1. Pin provenance and scaffold the package

- **Goal:** Establish immutable upstream evidence, package metadata, license, entry points, and audit files for R1, R9, and R11.
- **Files:** `packages/select/package.json`, `packages/select/LICENSE`, `packages/select/README.md`, `packages/select/UPSTREAM.md`, `packages/select/status.json`, `packages/select/upstream/**`, `packages/select/audit/**`.
- **Approach:** Retain canonical source, tests, snapshots, package metadata, and license. Verify all retained files with SHA-256 and exclude evidence from publication.
- **Test scenarios:** Reject modified, missing, or additional upstream artifacts; reject changed entry points or exports; verify the exact version, commit, license, and npm integrity.
- **Verification:** `upstream:verify` and `crosswalk:verify` pass from the package scripts.

### U2. Port the core Select runtime and public types

- **Goal:** Implement R2-R4 and R8 through the root and `base` entry points.
- **Files:** `packages/select/src/select.tsrx`, `packages/select/src/components.tsrx`, `packages/select/src/types.ts`, `packages/select/src/default-styles.ts`, `packages/select/src/menu-placement.ts`, `packages/select/src/scroll-manager.ts`, `packages/select/src/style-context.tsrx`, `packages/select/src/utils.ts`, `packages/select/src/index.ts`, `packages/select/src/base.ts`.
- **Approach:** Preserve the upstream state model and public component boundaries with Octane primitives. Keep menu and focused-option refs separate. Reconcile focus after options change. Preserve nested scroll locks and imperative `SelectInstance` methods.
- **Test scenarios:** Cover selection, clearing, multi-value removal, controlled props, component overrides, styles, themes, ARIA, keyboard, mouse, touch, forms, portal placement, flipping, scroll locking, focused-option scrolling, menu notices, ref methods, and reopening on the selected value.
- **Verification:** Runtime, SSR, Chromium, differential, and type suites pass without skipped parity cases.

### U3. Port composed entry points

- **Goal:** Implement R5-R7 across state-managed, async, creatable, async-creatable, and animated entry points.
- **Files:** `packages/select/src/state-managed-select.tsrx`, `packages/select/src/use-state-manager.tsrx`, `packages/select/src/async.tsrx`, `packages/select/src/use-async.tsrx`, `packages/select/src/creatable.tsrx`, `packages/select/src/use-creatable.tsrx`, `packages/select/src/async-creatable.tsrx`, `packages/select/src/animated/**`.
- **Approach:** Compose the core Select props exactly as upstream does. Use generation-safe async resolution and the Transition Group prerequisite for animated wrappers.
- **Test scenarios:** Cover controlled/uncontrolled precedence, cached and stale async requests, default and null notices, creation validation and placement, action metadata, Async Creatable interaction, animation appearance/removal, interruption, and descriptor identity.
- **Verification:** Optional-entry runtime, browser, SSR, and paired type fixtures pass.

### U4. Build executable React parity evidence

- **Goal:** Prove R3-R8 at the environments where each behavior is observable.
- **Files:** `packages/select/tests/**`, `packages/select/typetests/**`, `vitest.config.js`.
- **Approach:** Use React as the differential oracle, Chromium for DOM/layout behavior, SSR for server output, and TypeScript fixtures for public declarations.
- **Test scenarios:** Exercise all Acceptance Examples plus async replacement and rejection, portal auto-flip, overlapping scroll locks, imperative refs, single-select reopen focus, null notices, animated re-add/interruption, and mobile-style touch paths.
- **Verification:** The registered `react-select` Vitest project and all typecheck configurations pass.

### U5. Register fail-closed evidence and repository integration

- **Goal:** Complete R9-R11 with current generated inventories and repository metadata.
- **Files:** `packages/select/audit/react-parity.json`, `packages/select/audit/export-crosswalk.json`, `packages/select/audit/adapted-runtime.json`, `packages/select/scripts/**`, `scripts/react-parity/react-select-runtime-inventory.mjs`, `docs/binding-parity-gaps.md`, `docs/bindings-status.md`, `docs/packages.md`, `website/src/content/bindings.json`, `packages/cli/src/data/octane-data.json`, `packages/octane-evals/datasets/train/user-apps-v1/manifest.jsonl`, `.changeset/*.md`, `pnpm-lock.yaml`.
- **Approach:** Generate exact test identities and shared hashes. Validate all six entry points and 20 runtime exports. Run repository sync after authored files stabilize.
- **Test scenarios:** Reject stale inventory counts, duplicate identities, missing execution lanes, changed hashes, absent type fixtures, missing entry points, and unregistered package metadata.
- **Verification:** Package inventory, binding gap, sync, parity validation, format, and relevant repository checks are clean.

### U6. Review, ship as draft, and enforce readiness gates

- **Goal:** Land all eligible review findings and create a reviewable draft pull request without bypassing KTD6.
- **Files:** The final branch diff, `docs/plans/2026-08-03-001-feat-react-select-binding-plan.md`, and the durable portfolio tracker outside the repository.
- **Approach:** Apply validated correctness, API, race, testing, and maintainability findings. Commit and push the isolated branch. Open a draft pull request based on the Transition Group branch. Babysit lightweight checks and automated review before any ready-state promotion. After Transition Group merges, rebase onto or retarget to the main commit that contains it, then rerun repository sync, the complete parity suite, full CI, and current-head automated review before the pull request remains ready.
- **Test scenarios:** Confirm review fixes on the final head; confirm the PR is draft at creation; confirm no unresolved current-head automated feedback; return to draft if a later full-CI run fails.
- **Verification:** The pull request and durable tracker show the same lifecycle state and evidence links.

## Verification Contract

| Gate | Applicability | Covers | Done signal |
| --- | --- | --- | --- |
| Upstream integrity and export crosswalk | Always | U1, U5 | All 63 retained artifacts, six entry points, and 20 runtime exports match the pin. |
| React Select Vitest project | Always | U2-U5 | Runtime, SSR, Chromium, differential, verifier, and inventory tests pass with no skipped cases. |
| Public type compatibility | Always | U2-U4 | Package typecheck, paired fixtures, and exact pure-type compatibility assertions pass. |
| React parity validation | Always | U1, U4, U5 | Required lane hashes and collected test identities are current and execute. |
| Repository sync and package inventories | Always | U5 | Generated docs, CLI data, eval corpus, status, and gap inventories contain the package without unrelated drift. |
| Formatting and diff integrity | Before commit | U1-U6 | Authored files are formatted and `git diff --check` is clean. |
| Draft review gate | After push | U6 | Draft lightweight checks and current-head automated review are clean before promotion. |
| Full CI and final-head review | Before ready remains final | U6 | Full CI and final-head automated review are clean; failures return the PR to draft. |

## Definition of Done

- `@octanejs/select` exposes all six pinned public entry points and all 20 runtime exports with compatible runtime behavior, consumer-compiled types, and documented renderer type adaptations.
- Core, state-managed, async, creatable, async-creatable, and animated behaviors have executable React-oracle evidence in the appropriate server, browser, runtime, and type lanes.
- Provenance, license, source/test inventory, export crosswalk, collected test inventory, and parity hashes are current and fail closed.
- Package metadata, documentation, generated inventories, website catalog, eval corpus, lockfile, and changeset are current.
- All validated review findings are fixed or durably recorded with evidence. Abandoned implementation attempts and private test hooks are absent from the final diff.
- The isolated branch is pushed and its pull request is created as draft against the Transition Group prerequisite branch.
- The durable portfolio tracker records the binding, pull request, prerequisite, evidence, and current lifecycle status.
- The pull request follows the draft-first automated-review and full-CI lifecycle until merge or a genuine maintainer-only blocker.
