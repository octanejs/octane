---
'octane': patch
---

Forward recoverable hydration errors from ReactCompat islands to the owning
Octane root's `onRecoverableError` callback. Each error identifies the island
and keeps the original React error as its `cause`. An island whose root has no
callback uses React's default reporting.
