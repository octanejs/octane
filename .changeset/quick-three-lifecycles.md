---
'octane': patch
'@octanejs/three': patch
---

Add a renderer-infrastructure synchronous drain for universal hook and HMR
updates. Add direct `HTMLCanvasElement` and `OffscreenCanvas` lifecycle support,
composed Octane `act` and `flushSync` exports, callback-aware root unmounting,
WebGL context recovery, controlled WebXR animation-loop ownership, precise
universal HMR reconstruction, and the explicit-target low-level `DOMRegion`
boundary.
