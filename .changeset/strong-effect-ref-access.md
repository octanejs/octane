---
'octane': patch
'@octanejs/mcp-server': patch
---

Fix Strong mode rejecting effect setup that reads or writes a ref's `current`
or calls a state getter. Neither is an effect dependency: a ref holds a value
the effect uses without re-running, and a getter reads the latest state without
subscribing. Strong mode reported both as `OCTANE_STRONG_EFFECT_HIDDEN_DEPENDENCY`,
so previous-value refs, ref counters, a `Map` of callback-ref elements, a
`useLazyRef` store, and `getCount()` failed to compile in `useEffect`,
`useLayoutEffect`, and `useInsertionEffect` setup. They now compile as they do
in React. The diagnostic still reports a reassigned module variable read in
effect setup, and render-time ref reads and writes and state getter calls stay
errors.
