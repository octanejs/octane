---
'octane': patch
---

Vite and webpack HMR now hot-update exported arrow components in place: `export const X = () => <jsx/>`, `export const X = memo(() => <jsx/>)`, and the same consts exported through `export default X` (including `X as T`, `X satisfies T` and `X!`). They previously compiled without an accept boundary, so every edit reloaded the page. A memo-wrapped component keeps its memo wrapper and comparator across updates, and its hook-owned resources such as `useSignal$` scopes survive the refresh.
