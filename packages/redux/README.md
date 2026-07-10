# @octanejs/redux

[React Redux](https://react-redux.js.org) for the [octane](https://github.com/octanejs/octane) UI framework.

The react-redux 9.3.0 hooks + `Provider` surface (`useSelector`, `useDispatch`,
`useStore`, and the custom-context factory variants) reimplemented on octane's
`useSyncExternalStore` — works with any Redux 5 / Redux Toolkit store by
changing the import. Export parity with react-redux is pinned by test.

```tsx
import { Provider, useSelector, useDispatch } from '@octanejs/redux';
```

`connect()` (the legacy HOC surface) intentionally throws — the hooks API is
the supported surface.

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
