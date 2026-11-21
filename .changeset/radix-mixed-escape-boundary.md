---
'@octanejs/radix': patch
---

Escape now dismisses the newest dialog first when native and React Radix dialogs nest in place across `OctaneCompat` or `ReactCompat`, without `createEscapeLayerBridge()`. A native layer inside an `OctaneCompat` island listens on the window capture phase, and a native layer that contains `ReactCompat` content answers after the document's capture listeners.
