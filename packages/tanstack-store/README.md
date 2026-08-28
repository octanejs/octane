# @octanejs/tanstack-store

[TanStack Store](https://tanstack.com/store) bindings for the
[Octane](https://github.com/octanejs/octane) UI framework.

This package ports `@tanstack/react-store@0.11.0` by reusing the
framework-agnostic `@tanstack/store` core unchanged and transcribing its small
React hook layer onto Octane. The supported runtime and type surfaces match the
React package, so an application can migrate by changing its import:

```ts
// before
import { createStore, useSelector } from '@tanstack/react-store'

// after
import { createStore, useSelector } from '@octanejs/tanstack-store'
```

```tsx
import { createStore, useSelector } from '@octanejs/tanstack-store'

const counter = createStore({ count: 0 })

export function Counter() @{
  const count = useSelector(counter, (state) => state.count)

  <button
    onClick={() =>
      counter.setState((state) => ({ count: state.count + 1 }))
    }
  >
    {'Count: ' + count}
  </button>
}
```

## API

The package re-exports all of `@tanstack/store@0.11.0`, including atoms,
stores, actions, derived sources, `shallow`, and async atoms. It also provides
the stable adapter surface from `@tanstack/react-store@0.11.0`:

- `useSelector` reads any atom or store and supports a custom comparator.
- `useAtom` returns a writable atom's current value and setter.
- `useCreateAtom` and `useCreateStore` create a stable source for a component
  lifetime.
- `createStoreContext` transports typed bundles of atoms and stores through an
  Octane subtree.
- `useStore` remains available as the upstream-deprecated compatibility alias
  for `useSelector`.

The upstream experimental `_useStore` export is intentionally omitted. Use
`useSelector` with `store.actions` or `store.setState` instead.

The adapter forwards Octane's compiler-assigned hook slots through its composed
hooks. Distinct calls in one component therefore keep independent subscriptions
and component-created sources, including when optional selector and comparator
arguments are omitted.

## Verification

Behavioral tests cover writable and derived sources, comparator semantics,
source replacement, multiple hook call sites, context nesting, subscription
cleanup, actions, and server rendering. Differential tests compile the same
`.tsrx` fixture for Octane and React and compare rendered output after each
interaction. Compile-time tests cover overload inference and readonly versus
writable source constraints.

Current scope and verification status are tracked in the generated
[bindings status table](../../docs/bindings-status.md), sourced from this
package's [`status.json`](./status.json).
