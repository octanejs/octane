# Skill: Octane bug hunter

Use this to find, reproduce, minimize, and fix a suspected Octane bug.

## Read first

- `.ai/project-map.md`
- `AGENTS.md`
- Owning source and nearby tests
- `docs/react-parity-migration-plan.md` before assuming React mismatch is a bug

## Workflow

1. **State the suspected behavior**
   - Expected behavior, actual behavior, package, environment, and reproduction path.
   - Decide whether the issue concerns runtime, compiler, SSR/hydration, Vite plugin, or an ecosystem binding.

2. **Reproduce before fixing**
   - Add or locate the smallest failing test/fixture.
   - For compiler/runtime behavior, prefer `packages/octane/tests/_fixtures/*.tsrx` plus a focused `*.test.ts`.
   - For React parity, cite source React tests and use conformance/differential conventions.
   - For ecosystem packages, use that package's `tests/` harness.

3. **Minimize**
   - Remove unrelated props, effects, timing, and DOM.
   - Keep `.tsrx` fixtures tiny.
   - Confirm the test fails for the intended reason, not setup/aliasing/jsdom.

4. **Localize**
   - Runtime: inspect `packages/octane/src/runtime.ts` comments and closest tests.
   - Compiler: inspect `packages/octane/src/compiler/compile.js` and emitted output if needed.
   - SSR: inspect `runtime.server.ts`, `server/index.ts`, hydration tests.
   - Bindings: compare existing package patterns and upstream React binding behavior.

5. **Patch carefully**
   - Preserve documented intentional divergences.
   - Prefer fixing owning source over weakening tests.
   - Add regression coverage that would fail on the old behavior.
   - Keep changes minimal and idiomatic.

6. **Validate**
   - Run the new failing test until it passes.
   - Run nearby affected tests.
   - If runtime/compiler changed, consider wider `packages/octane/tests` or `pnpm test` depending on scope.
   - Run `pnpm typecheck` when TS/API surfaces changed.

7. **Report**
   - Root cause.
   - Files changed.
   - Tests added/updated and commands run.
   - Any remaining risks or intentional divergences.

## Common traps

- React synthetic `onChange`, StrictMode double invoke, and class components are not bugs by default. Controlled `value`/`checked` is supported, but text editing uses native `onInput`; `OCTANE_NATIVE_TEXT_ONCHANGE` warns about likely React-style host wiring without changing native behavior. Deliberate commit-on-blur uses `suppressNativeChangeWarning`.
- Differential `innerHTML` cannot catch render counts, effect timing, refs, focus, or node move sets.
- jsdom layout/focus limitations can masquerade as library bugs.
