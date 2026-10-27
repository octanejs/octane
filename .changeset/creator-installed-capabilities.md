---
'octane': patch
---

Ship less client runtime in applications that never use a capability. Context dependency checks install with the first recorded context read, the memo bail with `memo()`, a portal's Fragment-ref owner registration with the first Fragment ref, and controlled `<select>` restoration with the first controlled select value. Renderer-region bridge lookups drop from applications that never bind a region owner. A signal-free `createRoot` application such as the relay example ships about 1.2 KB less gzip, with the same render work.
