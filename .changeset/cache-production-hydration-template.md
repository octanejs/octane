---
'@octanejs/app-core': patch
---

Reuse the normalized production HTML template across SSR requests that do not
set a CSP nonce, avoiding a full template scan and rewrite on every render.
