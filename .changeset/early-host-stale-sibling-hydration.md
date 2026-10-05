---
"octane": patch
---

Hydration no longer loops when the next server node after an early-bound host (`adoptBindings`) is stale content. Hydration now removes that content, reports a recoverable error and keeps the adopted host, the same as it does when no early binding is installed. The lease is still refused when anything else changes a neighbor of the host.
