---
'octane': patch
'@octanejs/app-core': patch
---

Improve server streaming and hydration conformance for Suspense errors, aborts,
synchronous iterables and thenables, raw HTML/style safety, controlled fields,
and mismatch recovery.

Compose configured app root catch boundaries inside pending boundaries so route
errors render the catch UI while suspensions continue to render the pending UI.
