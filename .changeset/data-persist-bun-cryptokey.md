---
'octane': patch
---

`octane/data` now typechecks in programs that load `bun-types`, whose `CryptoKey` declaration defeated the `persist.key` getter check.
