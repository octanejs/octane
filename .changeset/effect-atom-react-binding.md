---
'@octanejs/effect-atom-react': patch
---

Add `@octanejs/effect-atom-react`, an Octane port of `@effect/atom-react` 4.1.0. It provides every hook (`useAtomValue`, `useAtom`, `useAtomSet` with its `promise` and `promiseExit` modes, `useAtomMount`, `useAtomRefresh`, `useAtomSubscribe`, `useAtomSuspense`, `useAtomInitialValues`, `useAtomRef`, `useAtomRefProp`, `useAtomRefPropValue`), `RegistryContext`, `RegistryProvider`, `scheduleTask`, `HydrationBoundary`, and the `ScopedAtom` helpers, with the same subpath entries as upstream. Atom reads use upstream's server snapshot, so server rendering and hydration keep the same atom values.
