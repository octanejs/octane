---
'octane': patch
---

Memoize `use()` arguments in plain `.ts`/`.js` hook modules with the same
dependency rules as `.tsrx` components.

A plain module's dependency array read values its `use()` argument skips.
`use(load(run?.(options.label) ?? 'idle'))`, `use(load(() => options.label))`
and `use(load(ready ? options.label : 'idle'))` each threw when `options` was
undefined, and a `typeof window !== 'undefined'` guard read a bare `window`
during server rendering. Skipped reads now use the guarded descriptor probe,
deferred reads use `options?.label`, and typeof guards are replayed.
