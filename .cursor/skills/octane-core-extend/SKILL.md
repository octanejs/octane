---
name: octane-core-extend
description: Change Octane's runtime, compiler, scheduler, reconciler, SSR, or hydration engine. Use before editing packages/octane/src. Covers the observable contract, hot-path analysis, and the performance evidence required before handoff.
---
# Skill: Extend Octane core

Use this when changing core runtime, compiler, AST/TSRX transforms, SSR, hydration, or public `octane` APIs.

## Read first

- `AGENTS.md`
- `.rulesync/rules/core-engineering.md`
- `README.md`
- `docs/differences-from-react.md`
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

## Every change lands with a regression test

No exceptions, and not only for bug fixes. Core code multiplies across every
Octane application, so each change ships with a test that would catch the
regression it could introduce.

- **Bug fix**: the test reproduces the report and fails before the fix.
- **New behavior**: the test pins the new contract, and a separate one pins the
  neighbouring behavior the change could have disturbed.
- **Refactor or optimization**: behavior is supposed to be identical, so the test
  pins the behavior being preserved. "The existing tests still pass" is not
  enough on its own; if no existing test would have caught the breakage you were
  worried about, that gap is the test to add.

A test only counts once you have seen it fail. Break the implementation
deliberately, confirm the test goes red, then restore. If it stays green it is
not protecting anything.

Cover the execution modes the change actually reaches: dev and prod compile,
client and server, render and hydrate, and the error, abort, and cleanup paths.
Assert consumer-observable behavior, never internals; `.rulesync/rules/testing.md`
sets the observation boundary and the harness to use.

Exact render counts, allocation identity, and codegen size are optimization
claims, so they belong in the benchmark ratio system with semantic controls
rather than in a correctness test.

## Decide owner

- Client behavior/hooks/events/refs/scheduler/context/Suspense/transitions/reconciler: `packages/octane/src/runtime.ts`
- SSR/server render: `packages/octane/src/runtime.server.ts`, `packages/octane/src/server/index.ts`
- Compiler/AST/TSRX lowering/Vite/Volar: `packages/octane/src/compiler/*`
- Public API: `packages/octane/src/index.ts`, `constants.ts`, README/types/tests
- Vite metaframework behavior: `packages/vite-plugin-octane/*`

## Compiler/AST workflow

1. Add a minimal `.tsrx` or `.tsx` fixture under `packages/octane/tests/_fixtures/`.
2. Add the regression test: assert runtime behavior, or emitted behavior through the public compiler path.
3. Inspect `compile.js` and any `@tsrx/core` AST assumptions.
4. Preserve source-location/dev diagnostics where applicable.
5. Ensure generated code still works with hook-slot injection and server/client paths.

## Runtime workflow

1. Add the regression test before patching, and watch it fail.
2. Identify whether behavior is mount, update, deletion, hydration, event delegation, scheduling, or effect flushing.
3. Read nearby runtime comments; treat them as design spec.
4. Preserve intentional divergences from React.
5. For React parity, use conformance or differential harness appropriately.

## Public API workflow

1. Update exports, and add a test covering the new or changed surface.
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
