---
'octane': patch
'@octanejs/xyflow': patch
---

Spreading props whose type has a string index signature no longer types the element's `ref` as `unknown` or as the index signature's value type. `@octanejs/xyflow`'s `Panel` now types its ref as `HTMLDivElement`.
