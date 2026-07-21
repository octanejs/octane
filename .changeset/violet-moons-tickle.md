---
'octane': patch
---

Adopt Svelte's DOM operations technique in the client runtime: the shared
traversal helpers (`child`/`sibling`, hydration cursor walks, range clears,
de-opt child scans) now call cached native `firstChild`/`nextSibling`
accessors so those megamorphic call sites stay monomorphic, and the expando
keys the runtime polls on nodes that mostly don't carry them (`$$<event>`
handler slots, `$$portalParent`/`$$portalEnd`, `$$deoptKey`, `$$ctrl`,
hydration markers) are pre-seeded as `undefined` on the `Element`/
`CharacterData` prototypes, turning negative lookups into fast prototype
hits. Drift-corrected js-framework list/mount operations improve ~5–20%.
