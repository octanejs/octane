---
title: Module-scoped counters cannot coordinate cross-instance invalidation
date: 2026-09-14
category: architecture
module: packages/octane/src
problem_type: architecture_pattern
component: frontend
severity: high
applies_when:
  - Adding or widening the authority of a module-scoped counter, version, or epoch that invalidates cached/skipped work
  - The guarded data (context objects, registries, identity tags) is deliberately shared across coexisting package instances via Symbol.for
tags: [dual-instance, symbol-for, epoch, context, invalidation, module-state]
---

# Module-scoped counters cannot coordinate cross-instance invalidation

## Context

Octane supports multiple coexisting copies of the package in one process — a
binding bundled against its own octane, an ESM/CJS dual load. `Context`
objects are deliberately cross-instance: `CONTEXT_TAG =
Symbol.for('octane.context')`, and universal-core accepts foreign contexts by
the same tag. A provider commit in copy B mutates the shared context object's
`$$version`, which copy A's consumers may have recorded in their dependency
maps.

## Guidance

A counter that decides "nothing changed" must live at the same scope as the
data it guards. An exported `let` in a module gives every loaded copy its own
counter: copy B's bump moves B's epoch while A's stamp still reads current —
exactly the silent-skip failure the counter exists to prevent. The bug only
appears when a *new* fast path starts trusting the counter; a counter that was
safe while it gated one narrow check becomes a correctness hole when its
authority widens.

Back the counter with a realm-global cell keyed by `Symbol.for`, matching the
codebase's existing cross-instance discipline (`CONTEXT_TAG`,
`RENDERER_REGION_OWNER`):

```ts
// packages/octane/src/context-epoch.ts
const EPOCH_CELL: { value: number } = ((globalThis as any)[
	Symbol.for('octane.contextEpoch')
] ??= { value: 0 });
export function contextEpochNow(): number { return EPOCH_CELL.value; }
export function bumpContextEpoch(): void { EPOCH_CELL.value++; }
```

An imported `let` cannot share state across copies, so readers go through the
accessor rather than the binding. Skewed copies sharing the cell only observe
foreign bumps as "epoch moved" — strictly the conservative direction.

## Applicability

Applies to any process-wide epoch, sequence counter, or invalidation token in
a published multi-entry package. The test that pins it is cheap:
`vi.resetModules()` + a second dynamic import, assert one copy's bump is
visible through the other's accessor
(`packages/octane/tests/context-epoch.test.ts`). Where a bump seam is
behavioral rather than adjacent (e.g. react-hosted mirrors whose
`$$version++` is discharged by a following `root.render`), document the
ordering contract on the field it guards — not only at the call site.
