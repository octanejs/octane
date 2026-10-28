---
'@octanejs/drei': patch
---

`<Html>` now renders a custom `geometry` or `material` on its occlusion mesh. Both were dropped, so the mesh fell back to three.js's empty default geometry and default material.
