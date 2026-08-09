---
'octane': patch
---

Avoid unnecessary asynchronous warming for synchronous components that read plain
props, preventing speculative getter evaluation and reducing generated render work.
