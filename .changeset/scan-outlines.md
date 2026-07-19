---
'@octanejs/scan': patch
---

Add the render-outline overlay: every component render flashes a labeled
rectangle over its DOM (react-scan's signature purple), fading per
`animationSpeed` (`off` disables drawing), re-measured every frame so
outlines track scrolling and layout shifts. The overlay canvas is
pointer-transparent and aria-hidden, never throws into the app, and degrades
to a no-op where 2D canvas is unavailable.
