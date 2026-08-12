---
'octane': patch
'@octanejs/rspack-plugin': patch
---

Allow universal renderers to route compiler-emitted thread-function helpers through an optional cold runtime module.

Lynx now uses that boundary to omit main-thread worklet registries and call bridges from applications that compile no worklets, while retaining late-chunk activation and the existing worklet-enabled behavior.
