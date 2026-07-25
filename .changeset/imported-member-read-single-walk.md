---
'octane': patch
---

The auto-memo purity analysis no longer walks each component body twice to ask
whether it reads a member of an imported binding. Both proofs that needed the
answer now share one lazily-resolved walk, and the predicate's unused
`includeJsx` flag, whose two values could not produce different results, is
gone. Compiler output is unchanged.
