---
'octane': patch
'@octanejs/rspack-plugin': patch
'@octanejs/rsbuild-plugin': patch
---

Add opt-in CSS-module constant folding to one-shot Rspack and Rsbuild production builds. Authenticate immutable JavaScript CSS exports from the actual module graph, preserve stylesheet ownership, and keep proof callbacks on the main thread when compiler workers are enabled. Native CSS modules and mutable default maps retain their existing behavior.
