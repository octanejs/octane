# @octanejs/sanity-icons

Complete Octane port of `@sanity/icons@5.2.1`.

```sh
npm install @octanejs/sanity-icons
pnpm add @octanejs/sanity-icons
```

```tsrx
import {RocketIcon} from '@octanejs/sanity-icons/Rocket'

export function Launch() @{
  <button><RocketIcon aria-hidden="true" /> Launch</button>
}
```

All upstream per-icon subpaths are generated and tree-shakable. The root `Icon` component
and lazy `icons` map are also available. SVG props, `currentColor`, arbitrary attributes,
native events, and normal Octane `ref` props are supported.
