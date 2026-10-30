# @octanejs/pierre-trees

[`@pierre/trees/react`](https://github.com/pierrecomputer/pierre/tree/main/packages/trees)
for [Octane](https://github.com/octanejs/octane). It ports the React entry of
`@pierre/trees@1.0.0-beta.6`: the `FileTree` component and the `useFileTree`,
`useFileTreeSelector`, `useFileTreeSelection` and `useFileTreeSearch` hooks. The
tree model, options and types still come from `@pierre/trees`, which is a peer
dependency.

## Installation

```bash
npm install @octanejs/pierre-trees @pierre/trees
pnpm add @octanejs/pierre-trees @pierre/trees
```

`@pierre/trees` 1.0.0-beta.6 lists `react` and `react-dom` as peer
dependencies, for its own `./react` entry. Octane apps do not import that entry,
so no React code is bundled, but your package manager may warn about the
missing peers or install them.

## Usage

```tsx
import { FileTree, useFileTree } from '@octanejs/pierre-trees';

export function Example({ paths }: { paths: string[] }) @{
	const { model } = useFileTree({
		initialExpansion: 'open',
		paths,
		search: true,
	});

	<FileTree
		model={model}
		header={<strong>Project files</strong>}
		renderContextMenu={(item) => <div>{'Menu for ' + item.path}</div>}
		style={{ height: '320px' }}
	/>
}
```

`useFileTree` creates the model once; later option changes are ignored, so
update the tree through its methods (`model.resetPaths()`, `model.setIcons()`,
and so on). Read model state in render with the hooks:

```tsx
import { useFileTreeSearch, useFileTreeSelection, useFileTreeSelector } from '@octanejs/pierre-trees';

const selectedPaths = useFileTreeSelection(model);
const search = useFileTreeSearch(model); // { isOpen, value, matchingPaths, open, close, setValue, ... }
const focusedPath = useFileTreeSelector(model, (current) => current.getFocusedPath());
```

`useFileTreeSelector` takes an optional equality function as its third argument.
While it returns `true`, the hook keeps returning the previous value.

## Server rendering

Preload the tree with `@pierre/trees/ssr` and pass `{ id, shadowHtml }` as
`preloadedData`:

```tsx
import { preloadFileTree } from '@pierre/trees/ssr';
import { FileTree, useFileTree } from '@octanejs/pierre-trees';

const options = { id: 'docs-tree', initialExpansion: 'open', paths: ['README.md', 'src/index.ts'] };
const preloadedData = preloadFileTree(options);

export function HydratedTree() @{
	const { model } = useFileTree(options);
	<FileTree model={model} preloadedData={preloadedData} style={{ height: '240px' }} />
}
```

On the server, `FileTree` writes the preloaded shadow root as a declarative
`<template shadowrootmode="open">`. `hydrateRoot` then adopts the host and the
tree.

## Differences from `@pierre/trees/react`

- Host event props such as `onClick` and `onClickCapture` receive native DOM
  events, as every Octane host does. Read `event.composedPath()` directly; there
  is no `event.nativeEvent`.
- `header` and `renderContextMenu` return Octane content (`OctaneNode`).

See [UPSTREAM.md](./UPSTREAM.md) for the pinned upstream source, the crosswalk and
the parity evidence. `@pierre/trees` is Apache-2.0: its license and NOTICE ship
as `LICENSE.upstream` and `NOTICE.upstream`.
