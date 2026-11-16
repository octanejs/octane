---
"octane": patch
---

Allow `flushSync()` to commit already scheduled updates without a callback. Both client and server also accept `undefined` or `null` and still return a supplied callback's result.
