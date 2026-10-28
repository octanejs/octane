---
'octane': patch
---

Components exported the usual React way, `export default Local` or `export default memo(Local)` with `Local` a component declared in the same module, now carry the same void-component proof as a named export. Their imported call sites and roots compile to the specialized slot instead of the generic one, so an app whose only generic call sites were such imports no longer ships the generic component renderer (about 21 kB gzip in a two-module fixture).
