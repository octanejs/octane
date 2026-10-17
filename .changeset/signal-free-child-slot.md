---
'octane': patch
---

Shrink apps that never use signals by about 4.4 kB raw (1.6 kB gzip). A renderable child now looks for a signal handle only once the signal engine has loaded or a module has enabled signal bindings, so a bundle without signals drops that detection and the code behind it. A handle passed through an opaque child still renders and updates, including one from a lazily imported module.
