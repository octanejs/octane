---
"@octanejs/xyflow": patch
---

Allow explicitly forwarded undefined values on internal props that already handle them as absent. This reduces strict TypeScript errors when compiling the package's authored source.
