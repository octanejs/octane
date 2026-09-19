---
'@octanejs/xyflow': patch
'@octanejs/inertia': patch
'@octanejs/aria': patch
---

Correct authored type-only imports and exports so compiled consumer builds do not request nonexistent runtime exports or a runtime entry from `@react-types/shared`.
