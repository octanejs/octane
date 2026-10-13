---
'octane': patch
---

Ship DevTools inspection of signal reads only in profiling builds. Native read sources, the native read driver and retry leases now carry their inspection metadata only when Octane's profiling flag is on, which takes about 1.1 kB raw (0.3 kB gzip) out of production apps that use signals. A DOM binding still ends quietly when the scope it observes retires.
