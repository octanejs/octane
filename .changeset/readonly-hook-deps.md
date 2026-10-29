---
'octane': patch
---

`useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useMemo`, `useCallback`, and `useImperativeHandle` now accept a readonly dependency list on the client and the server, as React's `DependencyList` (`readonly unknown[]`) does. A list a custom hook receives as `DependencyList`, or an `as const` tuple, previously failed to type-check with TS4104. Types only; runtime behavior is unchanged.
