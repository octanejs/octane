---
'octane': minor
---

Add `collectDiagnostics(source, filename, options)` to `octane/compiler`. It returns every diagnostic in a module, including every Strong violation, where `compile()` throws the first error. Strong diagnostics now point at the dedicated replacements: React's lazy ref initialization (`if (ref.current === null) ref.current = …` or `??=`) names `useLazyRef`, and an effect that copies a DOM measurement into state names `useLayoutSnapshot`. Where the rewrite is mechanical, the suggestion carries source `edits`: the lazy ref idiom becomes `useLazyRef(() => …)`, `useMemo(() => value, deps)` becomes `value`, and `useCallback(fn, deps)` becomes `fn`. A thrown Strong error now ends with a link to its entry at https://octanejs.dev/docs/strong-mode.
