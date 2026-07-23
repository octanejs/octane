---
'octane': patch
---

Keep client-only renderer server-stub source maps valid when the authored
module ends with a newline. Client-only modules without runtime exports now
emit an empty server stub.
