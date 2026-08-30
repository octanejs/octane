# @octanejs/redux

[React Redux](https://react-redux.js.org) for the [octane](https://github.com/octanejs/octane) UI framework.

## Installation

```sh
npm install @octanejs/redux redux
pnpm add @octanejs/redux redux
```

The react-redux 9.3.0 hooks + `Provider` surface (`useSelector`, `useDispatch`,
`useStore`, and the custom-context factory variants) reimplemented on octane's
`useSyncExternalStore` — works with any Redux 5 / Redux Toolkit store by
changing the import. Upstream runtime-export completeness is pinned by test;
the package also exposes the Octane extension helpers documented in
[`UPSTREAM.md`](./UPSTREAM.md).

```tsx
import { Provider, useSelector, useDispatch } from '@octanejs/redux';
```

`connect()` (the legacy HOC surface) intentionally throws — the hooks API is
the supported surface.

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
