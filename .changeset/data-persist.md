---
'octane': minor
---

`octane/data` adds an encrypted persistent cache. `createDataStore({ persist: { storage, partition, key, budget } })` saves each read's confirmed value, and each view's confirmed rows, and starts from them after a restart with their age kept: a fresh value needs no request, and a stale one shows while it reloads. Pending edits are never saved, and a value marked stale stays stale across a restart.

- **Storage** is an adapter, `PersistentStorage`, and `indexedDBStorage()` and `memoryStorage()` are included.
- **Encryption:** every value is encrypted with AES-GCM under `key`, a random secret from the signed-in session. Every name the storage sees (partition, key, version) is a keyed hash, so people who share a browser can neither read nor list each other's values. `retire()` clears the account's cache.
- **Shape changes:** a value saved under another shape of its read's output schema is discarded. The shape comes from the Standard JSON Schema extension where the validator provides it, so Zod 4.2+, ArkType and Valibot work. A value that fails validation when restored is discarded too. A read's new `version` option discards saved values on demand, and `persist: false` keeps a read out of the cache.
- **Budget:** `budget` caps the cache's size. `'auto'`, the default, sizes it by device: 1 MB at 2 GB of memory or less, 2 MB up to 4 GB, 5 MB above, halved when data saving is on, and at most 1% of the storage quota. Saves are batched into one storage transaction per host task. When over budget, the cache deletes expired values first, then the least recently used, down to 90% of the budget, and never deletes a value a mounted component is showing.
