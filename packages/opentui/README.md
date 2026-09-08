# `@octanejs/opentui`

An experimental Octane renderer for [OpenTUI](https://github.com/anomalyco/opentui),
tracking the public binding surface of `@opentui/react@0.5.8` without embedding
React Reconciler. Octane owns component execution, hooks, context, scheduling,
errors, refs, and effects; `@opentui/core` continues to own terminal layout,
input, rendering, and native resources.

## Runtime requirements

OpenTUI 0.5.8 requires either Bun 1.3 or newer, or Node.js 26.4 or newer with
`--experimental-ffi`. This package does not add a JavaScript fallback for
OpenTUI's native Zig renderer.

```sh
npm install @octanejs/opentui @opentui/core
pnpm add @octanejs/opentui @opentui/core
```

## Compiler configuration

OpenTUI components live in `*.opentui.tsrx` modules. Add the serializable
renderer preset to the Octane Vite, Rsbuild, or Rspack compiler configuration:

```ts
import { defineConfig } from '@octanejs/vite-plugin';
import { opentuiRenderers } from '@octanejs/opentui/config';

export default defineConfig({
	compiler: {
		renderers: opentuiRenderers,
	},
});
```

The preset uses OpenTUI host text, supports retained visibility and same-renderer
portals, and rejects server compilation. Terminal trees have no HTML SSR or
hydration path.

## Rendering an application

```tsx
// App.opentui.tsrx
import { useKeyboard, useTerminalDimensions } from '@octanejs/opentui';
import { useState } from 'octane';

export function App() @{
	const [count, setCount] = useState(0);
	const size = useTerminalDimensions();

	useKeyboard((event) => {
		if (event.name === 'return') setCount((value) => value + 1);
	});

	<box style={{ flexDirection: 'column', padding: 1 }}>
		<text>{'Count: ' + count}</text>
		<text>{'Terminal: ' + size.width + 'x' + size.height}</text>
	</box>
}
```

```ts
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@octanejs/opentui';
import { App } from './App.opentui.tsrx';

const renderer = await createCliRenderer();
const root = createRoot(renderer);
root.render(App);
```

`createRoot(renderer).render(Component, props)` follows Octane's programmatic
root convention. Destroying the `CliRenderer` unmounts the Octane root, and
`root.unmount()` releases component state, effects, listeners, refs, portals,
and owned renderables without destroying the caller-owned renderer.

## Surface

The built-in intrinsic catalogue matches OpenTUI React 0.5.8: `box`, `text`,
`code`, `diff`, `markdown`, `input`, `select`, `textarea`, `scrollbox`,
`ascii-font`, `tab-select`, `line-number`, `image`, `time-to-first-draw`, and
the text modifiers `span`, `br`, `b`, `strong`, `i`, `em`, `u`, and `a`.
Register application renderables with `extend()` and augment
`OpenTUIComponents` for their intrinsic types.

The binding exports `useRenderer`, `useKeyboard`, `usePaste`, `useFocus`,
`useBlur`, `useSelectionHandler`, `useOnResize`, `useTerminalDimensions`, and
`useTimeline`. OpenTUI callback names and argument lists are preserved: for
example, select `onChange(index, option)` remains a two-argument OpenTUI event,
not a DOM synthetic event.

`createPortal(children, target)` accepts a borrowed `RootRenderable` created
from the same `CliRenderer` context. Portal teardown removes only Octane-owned
children; the target remains caller-owned.

The OpenTUI slot system is available as `createOctaneSlotRegistry`, `Slot`, and
`createSlot`; `createReactSlotRegistry` and the upstream `React*` type names are
retained as migration aliases. Plugins return Octane universal renderables
instead of React nodes, and plugin failures are reported to the core registry
with source `"octane"`.

For native integration tests, `@octanejs/opentui/test-utils` exports
`testRender(Component, props, options)`. The package's focused test command runs
Vitest with Bun so the OpenTUI FFI-backed test renderer is available.

## Differences from `@opentui/react`

- Components are authored in `.opentui.tsrx`; the package does not export
  React's `createElement` or accept React elements.
- Programmatic roots render an Octane component plus props rather than a React
  node.
- Refs are ordinary Octane props and can be composed with `ref={[a, b]}`; there
  is no `forwardRef` layer.
- Octane's compiler-assigned hook slots permit hooks behind conditions and
  after early returns. The exported hooks forward manual slots internally.
- React DevTools integration and OpenTUI's React runtime-plugin bundling
  subpaths are not included. Compiler setup uses `opentuiRenderers` instead.
- OpenTUI terminal rendering is client-only; SSR and hydration are unsupported.

The compatibility baseline and verified scope are recorded in
[`status.json`](./status.json).
