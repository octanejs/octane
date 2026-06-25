---
"@octane-ts/zustand": patch
---

Initial release: zustand bindings for octane.

Reuses zustand's framework-agnostic vanilla store unchanged and reimplements only the
React binding on octane's `useSyncExternalStore`. Entry points:

- `@octane-ts/zustand` — `create`, `useStore`, `createStore` (octane-bound binding).
- `@octane-ts/zustand/vanilla` — `createStore` + types, re-exported verbatim.
- `@octane-ts/zustand/shallow` — `shallow` (verbatim) and an octane `useShallow`.
- `@octane-ts/zustand/middleware` — `persist`, `devtools`, `subscribeWithSelector`,
  `combine`, `redux`, … re-exported verbatim (all framework-agnostic).
- `@octane-ts/zustand/traditional` — `createWithEqualityFn`, `useStoreWithEqualityFn`,
  built on octane's `useSyncExternalStore` with a ref-cached equality bail-out (no
  `use-sync-external-store` shim — octane renders synchronously, so it isn't needed).

Most zustand code works by changing the import. Verified byte-for-byte against real
zustand on React via the differential rig.
