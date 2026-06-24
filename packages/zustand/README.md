# @octane-ts/zustand

[zustand](https://github.com/pmndrs/zustand) for the [octane](https://github.com/octane-ts/octane) renderer.

zustand separates a framework-agnostic **vanilla store** (`createStore`) from a tiny
**React binding** (`create` + `useStore`) built on `useSyncExternalStore`. This package
reuses the vanilla store unchanged (re-exported verbatim from `zustand/vanilla`) and
reimplements only the binding on top of octane's `useSyncExternalStore`. The public
surface matches zustand 1:1 — existing zustand code works by changing the import.

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

## How it works

octane keys hooks by a compiler-injected per-call-site `Symbol`, appended as the last
argument of every `use*` call. A custom hook is just a wrapper that **forwards** that
slot to the base hook it composes — which is all `useStore` does. Because the slot is
per-call-site, `useBearStore(a)` and `useBearStore(b)` in one component (or the same
hook used twice) stay independent, exactly like in React.

> The hook you call must follow the `use*` naming convention (`const useBearStore =
> create(...)`) so the compiler recognises it and injects the slot.
