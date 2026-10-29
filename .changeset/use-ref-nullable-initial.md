---
'octane': patch
---

`useRef<T>(null)` and `useRef<T>(undefined)` now type-check, matching React 19's overloads: `useRef<HTMLDivElement>(null)` returns `{ current: HTMLDivElement | null }` and `useRef<T>(undefined)` returns `{ current: T | undefined }`. Before, both reported TS2345 because the initializer had to be a `T`. The overloads apply to `octane`, `octane/server`, and `octane/universal`. Inferred calls such as `useRef(null)` and explicit non-nullable ones such as `useRef<number>(1)` are unchanged.
