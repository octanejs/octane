---
'octane': patch
---

Preserve pending native query streams when a parent rerenders with unchanged captured inputs, avoiding duplicate browser producers during streamed hydration. Changed inputs still replace the pending primary.
