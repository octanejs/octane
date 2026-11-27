---
'octane': patch
---

`createDataStore` and `createReplica` throw when `persist.key` is a string or bytes shorter than 16 bytes, which the docs already required. A short key from a `key` function leaves the cache in memory only, so nothing is encrypted with it.
