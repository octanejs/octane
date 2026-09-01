# @octanejs/animejs

[Anime.js](https://animejs.com) for [Octane](https://github.com/octanejs/octane).
The package re-exports Anime.js and adds an Octane lifecycle hook for scoped DOM
animations.

## Installation

```sh
npm install @octanejs/animejs
pnpm add @octanejs/animejs
```

The exact upstream pin, supported entry points, explicit subpath gaps, and test
dispositions are recorded in [`UPSTREAM.md`](./UPSTREAM.md).

```tsx
import { animate, useAnimeScope } from '@octanejs/animejs';

export function Logo() @{
  const animation = useAnimeScope(() => {
    animate('.dot', {
      x: 160,
      rotate: 360,
      alternate: true,
      loop: true,
    });
  }, []);

  <div ref={animation.root}>
    <div class="dot" />
    <button onClick={() => animation.scope.current?.refresh()}>Restart</button>
  </div>
}
```

`useAnimeScope(setup, dependencies?)` returns stable `root` and `scope` refs.
The scope is created after the root mounts, recreated when the dependency list
changes, and reverted during cleanup. Effects do not run during server
rendering.

## Three.js

Import the adapter subpath once before animating raw Three objects:

```ts
import { animate } from '@octanejs/animejs';
import '@octanejs/animejs/adapters/three';

animate(mesh, { x: 2, rotateY: 180 });
```

The subpath is the official Anime.js adapter, passed through unchanged.
`@octanejs/three` exposes the real Three object through refs, so no translation
layer is needed.

Anime.js owns the object mutation; `@octanejs/three` owns rendering. An
`always` frame loop needs no bridge. With `frameloop="demand"`, call the
Three root's `invalidate()` from Anime.js `onRender`. With
`frameloop="never"`, advance the Three root explicitly.

## Status

Current scope and verification evidence are tracked in the generated
[bindings status table](../../docs/bindings-status.md), sourced from this
package's [`status.json`](./status.json).
