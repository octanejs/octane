---
'octane': patch
---

Render `@catch` and `<ErrorBoundary>` fallbacks for server render errors, including rejected suspended work. `@pending` handles suspension rather than errors, so applications can use the same error boundary on the server and client.
