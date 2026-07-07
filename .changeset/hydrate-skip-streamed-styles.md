---
'octane': patch
---

`hydrateRoot()` now skips leading `<style data-octane>` tags when positioning the adoption cursor. A streamed shell flushes its deduped scoped-style tags ahead of the body markup (so painted fallbacks are styled), which previously broke hydration of streamed pages that use scoped `<style>` — the cursor adopted a style tag as the component root and rebuilt the whole tree.
