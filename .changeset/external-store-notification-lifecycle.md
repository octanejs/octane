---
'octane': patch
---

Avoid redundant external-store snapshot checks when an urgent DOM render is already queued. Keep universal-renderer subscriptions connected across snapshot and getter changes while preserving committed selectors, cleanup, and error handling. Avoid quadratic projection work for universal state-update queues that end in a replacement value.
