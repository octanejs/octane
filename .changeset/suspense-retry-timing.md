---
'octane': patch
---

Match React's Suspense retry timing: share the 300 ms retry-commit budget across boundaries, keep sibling reveals atomic, and retain already-visible transition content indefinitely by default. Explicit finite transition fallback timeouts remain available.

Support promises thrown by resource readers on the client and server, and fix suspended-render cleanup, initial-state supersession, error reporting, and staged renderer ownership without delaying dependent data requests. Keep deferred hydration notifications and captured clicks behind the actual retry commit.

Let pending and error fallbacks suspend through an enclosing boundary without losing their state. Defer suspended error-fallback reports until reveal, cancel abandoned reports, and allow a server response to finish without waiting for an obsolete suspending fallback.
