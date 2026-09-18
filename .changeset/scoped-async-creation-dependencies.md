---
'octane': patch
---

Fix automatically inferred async creation dependencies to respect lexical scope and erased TypeScript syntax. Preserve safe evaluation of bare `typeof` reads for absent globals, and refresh requests when callback parameter defaults reference changed outer values.
