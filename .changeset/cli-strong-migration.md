---
'@octanejs/cli': minor
---

`octane analyze` reports every Strong violation in a file instead of the first, and analyzes `.tsx` modules whose JSX goes to Octane by default. `--strong-preview` compiles every module as if Strong mode were on and counts what it would reject by code, without failing on modules that are not Strong yet. `--fix` applies the compiler's suggested edits, such as React's lazy ref initialization to `useLazyRef` and `useMemo`/`useCallback` to plain declarations. `octane explain` also explains Strong diagnostic codes, with their replacements and migration recipes.
