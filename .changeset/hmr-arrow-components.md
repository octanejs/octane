---
'octane': patch
---

Vite and webpack HMR now hot-update components exported in the common React shapes instead of reloading the page: `export const X = () => <jsx/>`, `export const X = memo(() => <jsx/>)`, and a `const` arrow, `memo` arrow or `function X() {…}` exported through `export default X` (including `X as T`, `X satisfies T` and `X!`). These previously compiled without an accept boundary. A memo-wrapped component keeps its memo wrapper and comparator across updates, and its hook-owned resources such as `useSignal$` scopes survive the refresh.
