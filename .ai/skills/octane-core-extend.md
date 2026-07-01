# Skill: Extend Octane core

Use this when changing core runtime, compiler, AST/TSRX transforms, SSR, hydration, or public `octane` APIs.

## Read first

- `.ai/project-map.md`
- `AGENTS.md`
- `README.md`
- `docs/react-parity-migration-plan.md`
- Owning source comments and nearby tests

## Decide owner

- Client behavior/hooks/events/refs/scheduler/context/Suspense/transitions/reconciler: `packages/octane/src/runtime.ts`
- SSR/server render: `packages/octane/src/runtime.server.ts`, `packages/octane/src/server/index.ts`
- Compiler/AST/TSRX lowering/Vite/Volar: `packages/octane/src/compiler/*`
- Public API: `packages/octane/src/index.ts`, `constants.ts`, README/types/tests
- Vite metaframework behavior: `packages/vite-plugin-octane/*`

## Compiler/AST workflow

1. Add a minimal `.tsrx` or `.tsx` fixture under `packages/octane/tests/_fixtures/`.
2. Add a focused test that asserts either runtime behavior or emitted behavior through the public compiler path.
3. Inspect `compile.js` and any `@tsrx/core` AST assumptions.
4. Preserve source-location/dev diagnostics where applicable.
5. Ensure generated code still works with hook-slot injection and server/client paths.

## Runtime workflow

1. Add a regression test before patching.
2. Identify whether behavior is mount, update, deletion, hydration, event delegation, scheduling, or effect flushing.
3. Read nearby runtime comments; treat them as design spec.
4. Preserve intentional divergences from React.
5. For React parity, use conformance or differential harness appropriately.

## Public API workflow

1. Update exports and tests.
2. Update README/docs if user-facing.
3. Add changeset unless docs/test-only.
4. Consider ecosystem binding impacts and aliases in `vitest.config.js`.

## Validation

- New/changed targeted tests.
- Nearby core tests.
- `pnpm typecheck` for API/compiler TS changes.
- `pnpm test` for broad runtime/compiler changes when feasible.

## Risk checks

- Does the change alter hook slot stability?
- Does it change SSR/hydration consistency?
- Does it change event semantics from native to synthetic? If yes, likely wrong.
- Does it add React controlled-input behavior? If yes, likely intentional divergence violation.
- Does keyed reconciliation preserve final DOM and survivor identity?
- Are `tsrx` and `tsx/jsx` paths both considered?
