# @octanejs/overlayscrollbars

Octane binding for [`overlayscrollbars-react@0.5.6`](https://github.com/KingSora/OverlayScrollbars). The vanilla `overlayscrollbars` core is a peer dependency.

## Installation

```sh
npm install @octanejs/overlayscrollbars overlayscrollbars
pnpm add @octanejs/overlayscrollbars overlayscrollbars
```

```ts
import { OverlayScrollbarsComponent, useOverlayScrollbars } from '@octanejs/overlayscrollbars';

export function ScrollArea(props: { children?: unknown }) {
  return OverlayScrollbarsComponent({
    className: 'scroll-area',
    defer: true,
    children: props.children,
  });
}
```

Pass `ref` as a prop. `ref.current.osInstance()` returns the `overlayscrollbars` instance after mount. See [UPSTREAM.md](./UPSTREAM.md).
