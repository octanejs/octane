---
"octane": patch
---

A hydration that suspends no longer lets outside code change the site of an early-bound host (`adoptBindings`). When the suspended attempt rolled back, it restored the stale server content it had removed beside the host, but the host's parent stayed marked as repaired. If other code then removed that content, the resumed attempt accepted the lease anyway and retired the early binding. Hydration now refuses the lease in that case and the early binding stays live. The refusal goes to the root's `onUncaughtError` instead of escaping as an unhandled error, because no `hydrateRoot` caller is left to catch it.
