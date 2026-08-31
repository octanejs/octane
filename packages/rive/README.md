# @octanejs/rive

[Rive](https://rive.app) canvas bindings for [Octane](https://github.com/octanejs/octane), ported from
[`@rive-app/react-canvas@4.32.0`](https://www.npmjs.com/package/@rive-app/react-canvas).

This is the official canvas wrapper only. It reuses `@rive-app/canvas@2.40.0`
unchanged and re-exports that package's runtime surface.

## Installation

```sh
npm install @octanejs/rive
pnpm add @octanejs/rive
```

```ts
import Rive, { useRive, useStateMachineInput } from '@octanejs/rive';

function Banner() {
	const state = useRive({ src: '/hero.riv', autoplay: true });
	return state.RiveComponent({ 'aria-label': 'Hero animation' });
}
```

`RiveComponent` is a function component that mounts a container `div` and a
`canvas`. There is no `forwardRef`; pass `ref` as a normal prop on host
elements, or use the `setCanvasRef` / `setContainerRef` callbacks returned by
`useRive`.

## Migrating

Replace imports from `@rive-app/react-canvas` with `@octanejs/rive`. Hook names
and authored call shapes match the pinned React canvas wrapper. Hooks may sit
behind conditions in `.tsrx` because Octane keys them by compiler slot; the
binding forwards those slots from plain `.ts` via `splitSlot` / `subSlot`.

## Status

Current scope and verification evidence are tracked in [`status.json`](./status.json)
and the pin/crosswalk in [`UPSTREAM.md`](./UPSTREAM.md).
