---
'octane': patch
---

Infer dependencies for effect-family hooks, `useMemo`, `useCallback`, and
`useImperativeHandle` when their dependency list is omitted. Explicit arrays
retain React semantics, while `null` opts into running or recomputing after
every render.
