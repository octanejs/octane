---
'octane': patch
---

Ship the host element descriptor renderer only in applications that can build a
host element descriptor. Renderable holes over text, arrays, component
descriptors and compiled children no longer pull in the runtime host renderer or
its generic attribute and controlled-form writers, so `.tsrx` applications that
never create host descriptors shrink by up to 18% of their client JavaScript
(gzip). Calls to module function components also skip the dynamic-tag entry.
