---
'octane': patch
---

Allocate a signal scope's request, resource, streamed-result, derived-binding,
adoption and trace bookkeeping only when those features are used. A `useSignal$`
hook scope now retains about 70% less memory, and bundles that use scoped
signals without streamed results are about 700 bytes smaller after gzip.
Streamed selections move into a capability that only the stream ingress
functions create.
