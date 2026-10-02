---
'octane': patch
---

Fix a runtime host element (from `createElement`) duplicating its children when
hydration retries after suspending. When the server rendered other children than
the client's, the first attempt built the client's children inside the adopted
host; the retry then built a second copy beside them. The retry now replaces the
earlier attempt's children, and a root that retries restores the server's.
A child host element that replaces server content now calls `onRecoverableError`
once across retries, and in development warns once at the hole that renders the
runtime host.
