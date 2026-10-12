---
'octane': patch
'@octanejs/rspack-plugin': patch
---

Mount imported lightweight components without an anchor comment in Vite and Rspack production builds when their module proves the component's root keeps its position, as same-module calls already do. A host whose children are all components no longer clones and positions one empty comment per such child. Rendering, hydration and update behavior are unchanged.
