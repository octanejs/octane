---
'@octanejs/app-core': patch
---

Prepare and reuse normalized production HTML template fragments across SSR
requests that do not set a CSP nonce, avoiding repeated hydration normalization
and static-template validation on every render.
