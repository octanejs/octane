---
'@octanejs/app-core': patch
---

Preserve middleware `Access-Control-Expose-Headers` alongside `Octane-RPC-Outcome` so trusted cross-origin RPC clients can read headers such as `Retry-After` and request identifiers.
