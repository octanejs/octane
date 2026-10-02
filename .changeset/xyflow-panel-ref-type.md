---
'@octanejs/xyflow': patch
---

Type `Panel`'s forwarded ref as `Octane.Ref<HTMLDivElement>` instead of the bare generic, which TypeScript 7 rejects with TS2314.
