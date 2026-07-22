---
'octane': patch
---

Add an opt-in universal-renderer compiler capability for `'main thread'` and
`'background only'` functions. Emit stable function identities, isolated
capture bindings, layer-specific dead-code and import removal, namespaced
main-thread host props, and source-attributed diagnostics through a
renderer-owned thread-function ABI.
