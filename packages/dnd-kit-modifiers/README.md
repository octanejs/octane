# `@octanejs/dnd-kit-modifiers`

Movement modifiers for the legacy dnd kit API on Octane: the `restrictTo*`
modifiers, `snapCenterToCursor`, and `createSnapModifier`, ported from
`@dnd-kit/modifiers` 9.0.0. Pass them to `DndContext` or `DragOverlay` from
`@octanejs/dnd-kit-core`.

## Installation

```sh
npm install @octanejs/dnd-kit-modifiers @octanejs/dnd-kit-core octane
pnpm add @octanejs/dnd-kit-modifiers @octanejs/dnd-kit-core octane
```

Replace imports from `@dnd-kit/modifiers` with `@octanejs/dnd-kit-modifiers`;
[`@octanejs/codemod`](../codemod) rewrites them for you.

## Usage

```tsrx
import { DndContext } from '@octanejs/dnd-kit-core';
import { restrictToFirstScrollableAncestor, restrictToHorizontalAxis } from '@octanejs/dnd-kit-modifiers';

const modifiers = [restrictToHorizontalAxis, restrictToFirstScrollableAncestor];

export function Tabs() @{
  <DndContext modifiers={modifiers}>
    <nav>{/* draggable tabs */}</nav>
  </DndContext>
}
```

## About this port

This package is part of Octane's port of the legacy dnd kit API, the
`@dnd-kit/core` 6.x family: `@octanejs/dnd-kit-core`, `@octanejs/dnd-kit-sortable`,
`@octanejs/dnd-kit-modifiers`, `@octanejs/dnd-kit-utilities`, and
`@octanejs/dnd-kit-accessibility`, one per upstream package. For the modern
`@dnd-kit/react` API, use [`@octanejs/dnd-kit`](../dnd-kit).

Parity is `recorded-unverified`. Upstream's own unit tests are placeholders, so
each package runs them pristine and adapted, and a repo-authored differential test
runs the same fixtures against the published React package and compares the DOM
after every drag step. See [`UPSTREAM.md`](./UPSTREAM.md) for the pin and the
evidence.
