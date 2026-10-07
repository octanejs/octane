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
- hot paths and expected call frequency: per render, node, item, event, signal
  notification, or request, versus once per root or module;
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

## Hot-path rules

The full rules, with the runtime code that already follows each one, are in
`performance-audit`'s references: [V8 shapes](../performance-audit/references/v8-shapes.md),
[DOM work](../performance-audit/references/dom-work.md), and
[scheduling](../performance-audit/references/scheduling.md). The ones core
changes break most often:

- **Block and Scope shape.** A new field on `BlockImpl`, `ScopeImpl`, or
  `LiteBlockImpl` is a `declare` field, initialized unconditionally in the
  constructor with `null`, `undefined`, or `0` when it is feature-only. Never
  write an undeclared field, even through `(block as any)`. Before #990, 13 such
  writes forked the Block map until that PR declared and initialized their
  fields. Per-call-site state goes in `scope.slots`,
  not on the instance.
- **Records.** Build hot records in one literal or constructor with every key,
  in one order, across every allocation site. No `delete`, conditional spreads,
  or per-instance `Object.freeze`. Keep numeric fields integral and arrays
  packed.
- **Reachability.** Never name a heavy function from a compiled hot path.
  Optional features stay behind their driver or capability, and hydration-only
  reads behind `hydrating` guards that fold.
- **DOM.** The commit writes and does not read geometry. Measure in a batched
  phase or after paint.
- **Scheduling.** `scheduleRender` coalesces a synchronous burst into one
  `queueMicrotask(flush)`. Do not add a render or commit per microtask hop,
  value, item, or dispatch. Do not treat `await`, `queueMicrotask`, or
  `requestAnimationFrame` as a yield, and do not add another ad-hoc task poster.
  The microtask-batched contract in `docs/differences-from-react.md` §Scheduler
  changes only through issue #1864's decisions, never in passing.

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

## Strong diagnostics

A new or changed `OCTANE_STRONG_*` code, or a new hook that replaces a pattern
Strong rejects, belongs in `packages/octane/src/compiler/strong-diagnostics.js`.
Add its entry, and a recipe when it replaces a React idiom, then run
`pnpm strong:diagnostics`. That regenerates the website reference, llms.txt,
`docs/strong-compiler-checks.md`, and the MCP server's copy, and
`strong-diagnostics-catalog.test.ts` fails on a code without an entry or a
recipe the compiler does not accept. The message should name the replacement
API; the compile error is the documentation an agent reads first.

## Validation

- New/changed targeted tests.
- Nearby core tests.
- `pnpm typecheck` for API/compiler TS changes.
- `pnpm test` for broad runtime/compiler changes when feasible.
- The relevant benchmark suite before and after performance-sensitive changes,
  using the same environment, warmup, iterations, and semantic controls. Run
  only the owning suite locally; CI runs the wide ones.
- The `perf-review` skill on the final diff (`node scripts/perf-review-scan.mjs`),
  with every `must-fix` finding resolved and the report in the handoff.
- `pnpm format:files <path...>` while iterating and
  `pnpm format:files:check <path...>` for a scoped check.

## Risk checks

- Does the change alter hook slot stability?
- Does it change SSR/hydration consistency?
- Does it change event semantics from native to synthetic? If yes, likely wrong.
- Does it add React controlled-input behavior? If yes, likely intentional divergence violation.
- Does keyed reconciliation preserve final DOM and survivor identity?
- Are `tsrx` and `tsx/jsx` paths both considered?
- Does it add a field, receiver map, or allocation to a per-render or per-node
  path?
- Can a burst of ready values, dispatches, or notifications now render or commit
  once per microtask hop?
- Does a hot or compiled path now reach code it did not reach before?

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
