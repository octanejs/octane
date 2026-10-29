# `@octanejs/dnd-kit-utilities`

Hooks and DOM helpers for the legacy dnd kit API on Octane, ported from
`@dnd-kit/utilities` 3.2.2: `CSS` transform serializers, `getWindow`,
`getOwnerDocument`, coordinate math, event and node type guards, and the
`useCombinedRefs`, `useEvent`, `useNodeRef`, `useUniqueId` and related hooks.

## Installation

```sh
npm install @octanejs/dnd-kit-utilities octane
pnpm add @octanejs/dnd-kit-utilities octane
```

Replace imports from `@dnd-kit/utilities` with `@octanejs/dnd-kit-utilities`;
[`@octanejs/codemod`](../codemod) rewrites them for you.

## Usage

```ts
import { CSS, getOwnerDocument } from '@octanejs/dnd-kit-utilities';

CSS.Translate.toString({ x: 10, y: 20, scaleX: 1, scaleY: 1 }); // 'translate3d(10px, 20px, 0)'
getOwnerDocument(element);
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
