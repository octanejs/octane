# Skill: Extend Octane core

Use this when changing core runtime, compiler, AST/TSRX transforms, SSR, hydration, or public `octane` APIs.

## Read first

- `.ai/project-map.md`
- `AGENTS.md`
- `.rulesync/rules/core-engineering.md`
- `README.md`
- `docs/react-parity-migration-plan.md`
- Owning source comments and nearby tests

## Required preflight

Before editing, write down:

- the consumer-observable contract and invariants;
- affected execution modes (dev/prod, client/server, render/hydrate, error/abort);
- hot paths and expected call frequency;
- a credible failing behavioral test for a bug, or a relevant benchmark baseline
  for an optimization.

Assume framework-fundamental code is performance-sensitive until the call graph
shows otherwise. Use the `performance-audit` skill alongside this skill whenever
the change can affect per-component, per-render, per-node, compiler-output, SSR,
hydration, scheduling, reconciliation, or bundle costs.

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
- The relevant benchmark suite before and after performance-sensitive changes,
  using the same environment, warmup, iterations, and semantic controls.
- `pnpm format:check` after every file change, as required by `AGENTS.md`.

## Risk checks

- Does the change alter hook slot stability?
- Does it change SSR/hydration consistency?
- Does it change event semantics from native to synthetic? If yes, likely wrong.
- Does it add React controlled-input behavior? If yes, likely intentional divergence violation.
- Does keyed reconciliation preserve final DOM and survivor identity?
- Are `tsrx` and `tsx/jsx` paths both considered?

## Adversarial self-review

Inspect the complete diff after validation. Try applicable empty, large,
repeated, nested, reordered, reentrant, error, abort, cleanup, and hydration
cases. Trace each allocation and retained reference through release, inspect
adjacent fast paths and every changed caller, compare with a simpler design, and
remove complexity that does not justify its permanent cost. Resolve findings and
repeat the review on the final diff.

The handoff must report the contract, correctness evidence, measured baseline and
candidate deltas (or why trustworthy measurement was impossible), self-review
improvements, and residual risk.
