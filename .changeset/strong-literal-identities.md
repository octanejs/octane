---
'octane': patch
'@octanejs/mcp-server': patch
---

Keep Strong-mode ref arrays and immutable object/array props stable when their
inputs are unchanged, including object literals assigned to a local before
being passed to a component. Local values used during setup or captured by
callbacks keep their ordinary JavaScript lifetime. Allow `useMemo` and
`useCallback` in Strong mode with inferred, explicit, or null dependencies so
authors can choose when to recompute a value or recreate a callback.
