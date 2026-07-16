---
'octane': patch
---

Observe client-created thenables adopted from SSR suspense seeds so a later
rejection cannot escape as an unhandled browser error during hydration.
