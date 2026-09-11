# @octanejs/animejs

[Anime.js](https://animejs.com) for [Octane](https://github.com/octanejs/octane).
Import vanilla animation APIs directly from `animejs`. Add `@octanejs/animejs`
when you need `useAnimeScope` to manage scoped DOM animations through Octane's
lifecycle. Existing Anime.js re-exports remain supported for compatibility.

## Installation

```sh
npm install animejs@4.5.0 @octanejs/animejs
pnpm add animejs@4.5.0 @octanejs/animejs
```

The exact upstream pin, supported entry points, direct upstream imports, and test
dispositions are recorded in [`UPSTREAM.md`](./UPSTREAM.md).
Keep the direct Anime.js dependency aligned with that pin so animations and
`useAnimeScope` share the same upstream instance.

```tsx
import { animate } from 'animejs';
import { useAnimeScope } from '@octanejs/animejs';

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
import { animate } from 'animejs';
import 'animejs/adapters/three';

animate(mesh, { x: 2, rotateY: 180 });
```

This is the official Anime.js adapter. The existing
`@octanejs/animejs/adapters/three` convenience path also passes it through unchanged.
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
