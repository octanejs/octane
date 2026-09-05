---
'octane': patch
---

Honor `ref` on a scoped `<style>` block by writing the block's class-map object
to the ref target (assignment, callback, or a `current`/`value` ref) instead of
silently dropping the attribute.
