---
'octane': patch
'@octanejs/three': patch
---

Tree-shake unused Three.js constructors from compiled scenes and keep direct
Three renderer roots independent of the DOM runtime while preserving full
Canvas catalogues, context providers, and mixed-renderer scheduling.
