# @octane-ts/zustand

[zustand](https://github.com/pmndrs/zustand) for the [octane](https://github.com/octane-ts/octane) renderer.

zustand separates a framework-agnostic **vanilla store** (`createStore`) from a tiny
**React binding** (`create` + `useStore`) built on `useSyncExternalStore`. This package
reuses the vanilla store unchanged (re-exported verbatim from `zustand/vanilla`) and
reimplements only the binding on top of octane's `useSyncExternalStore`. The public
surface matches zustand 1:1 — most zustand code works by changing the import.

```tsx
// before
import { create } from 'zustand';
// after
import { create } from '@octane-ts/zustand';

const useBearStore = create((set) => ({
  bears: 0,
  increase: () => set((s) => ({ bears: s.bears + 1 })),
}));

function BearCounter() @{
  const bears = useBearStore((s) => s.bears);
  <h1>{bears as string} bears</h1>
}
```

## Entry points

| import | what you get | notes |
| --- | --- | --- |
| `@octane-ts/zustand` | `create`, `useStore`, `createStore` | the React binding, octane-bound |
| `@octane-ts/zustand/vanilla` | `createStore` + types | re-exported verbatim from zustand |
| `@octane-ts/zustand/shallow` | `shallow`, `useShallow` | `shallow` verbatim; `useShallow` octane-bound |
| `@octane-ts/zustand/middleware` | `persist`, `devtools`, `subscribeWithSelector`, `combine`, `redux`, `createJSONStorage`, … | re-exported verbatim (all framework-agnostic) |

## How it works

octane keys hooks by a compiler-injected per-call-site `Symbol`, appended as the last
argument of every `use*` call. A custom hook is just a wrapper that **forwards** that
slot to the base hook it composes — which is all `useStore` does. Because the slot is
per-call-site, `useBearStore(a)` and `useBearStore(b)` in one component (or the same
hook used twice) stay independent, exactly like in React.

> **Naming matters.** The hook you call must follow the `use*` convention (`const
> useBearStore = create(...)`) so the compiler recognises it and injects the slot —
> this is the same `use*`-is-reserved-for-hooks rule React uses.

## Selecting object slices — `useShallow`

A selector that returns a fresh object/array each call (`(s) => ({ a: s.a })`) never
compares Object.is-equal, so it re-renders on every store change. Wrap it with
`useShallow` to compare by shallow equality:

```tsx
import { useShallow } from '@octane-ts/zustand/shallow';

function Sliced() @{
  const { a, b } = useBearStore(useShallow((s) => ({ a: s.a, b: s.b })));
  // re-renders only when a or b actually changes
}
```

## Divergences from React

- **Unstable selectors don't loop.** React's `useSyncExternalStore` throws the dev
  warning _"The result of getSnapshot should be cached"_ and re-renders in a loop when
  a selector returns a new reference every render. octane settles after a bounded
  number of renders instead — no loop, no warning. Prefer `useShallow` regardless, for
  the same reason you would in React (avoid the extra renders).

## Not yet ported

- `@octane-ts/zustand/traditional` (`createWithEqualityFn` / `useStoreWithEqualityFn`).
  Use `useShallow` — the v5-recommended replacement for the equality-fn pattern.
