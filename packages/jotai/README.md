# @octanejs/jotai

[jotai](https://github.com/pmndrs/jotai) for the [octane](https://github.com/octanejs/octane) UI framework.

jotai separates a framework-agnostic **vanilla core** (`atom`, `createStore`,
`getDefaultStore` + all of `vanilla/utils`) from a small **React binding**
(`Provider`, `useStore`, `useAtom`, `useAtomValue`, `useSetAtom`). This package
reuses the vanilla core unchanged (re-exported verbatim from `jotai/vanilla`) and
reimplements only the binding on octane's hooks — deliberately preserving
upstream's implementation shape (a force-update `useReducer` + effect
subscription, not `useSyncExternalStore`), so re-render behavior matches jotai on
React. The public surface matches jotai 1:1 — existing jotai code works by
changing the import.

```tsx
// before
import { atom, useAtom } from 'jotai';
// after
import { atom, useAtom } from '@octanejs/jotai';

const countAtom = atom(0);

function Counter() @{
  const [count, setCount] = useAtom(countAtom);
  <button onClick={() => setCount((c) => c + 1)}>count is {count as string}</button>
}
```

## Entry points

| import | what you get | notes |
| --- | --- | --- |
| `@octanejs/jotai` | `atom`, `createStore`, `getDefaultStore`, `Provider`, `useStore`, `useAtom`, `useAtomValue`, `useSetAtom` | vanilla verbatim + the octane-bound binding |
| `@octanejs/jotai/vanilla` | `atom`, `createStore`, `getDefaultStore` + types | re-exported verbatim from jotai |
| `@octanejs/jotai/vanilla/utils` | `RESET`, `atomWithReset`, `atomWithStorage`, `atomWithReducer`, `atomFamily`, `selectAtom`, `splitAtom`, `loadable`, `unwrap`, … | re-exported verbatim (all framework-agnostic) |
| `@octanejs/jotai/vanilla/internals` | `INTERNAL_*` store building blocks | re-exported verbatim; unstable by upstream contract |
| `@octanejs/jotai/react` | `Provider`, `useStore`, `useAtom`, `useAtomValue`, `useSetAtom` | the binding, ported to octane hooks |
| `@octanejs/jotai/react/utils` | `useResetAtom`, `useAtomCallback`, `useHydrateAtoms`, `useReducerAtom` | ported to octane hooks |
| `@octanejs/jotai/utils` | everything from `vanilla/utils` + `react/utils` | mirror of `jotai/utils` |

`jotai/babel/*` (React-specific compile-time plugins) is not shipped.

## How it works

octane keys hooks by a compiler-injected per-call-site `Symbol`, appended as the
last argument of every `use*` call. The hooks here **forward** that slot to the
base hooks they compose (deriving a stable sub-slot per composed base hook), so
`useAtom(a)` and `useAtom(b)` in one component — or the same atom used twice —
stay independent, exactly like distinct call sites in React.

The binding is a line-for-line port of `jotai/react`: a reader holds a
`[value, store, atom]` tuple in a force-update reducer and subscribes to the
store in an effect. That means the same observable behavior as jotai on React,
including:

- **`useSetAtom` never re-renders the writer.** A component that only writes an
  atom doesn't subscribe to it.
- **Derived atoms bail out.** A dependency write that recomputes to an
  `Object.is`-equal value never notifies readers.
- **Readers mount with two renders** (the subscription effect re-checks the
  value after subscribing) — same as upstream.

## Async atoms + Suspense

An atom whose value is a promise suspends the reader through octane's `use()`
(React-19 parity) on jotai's identity-stable *continuable promise*. Use a
suspense boundary (`@try { } @pending { } @catch (e) { }` or `<Suspense>`), or
skip suspending entirely with the vanilla `loadable`/`unwrap` escape hatches:

```tsx
const userAtom = atom(async () => (await fetch('/api/user')).json());

function Profile() @{
  <div>
    @try {
      <UserName />
    } @pending {
      <span>loading…</span>
    } @catch (e) {
      <span>failed: {(e as Error).message}</span>
    }
  </div>
}
```

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
