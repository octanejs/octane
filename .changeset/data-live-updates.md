---
'octane': minor
---

`octane/data` takes live updates and gives an app control over its persistent cache. `store.publish(read, input, value)` accepts a confirmed value from the app's own subscription. It validates the value and adopts it as a load would: it shares records, saves the value, and keeps pending edits on top. It also supersedes any load, restore or earlier publish still in flight. `await store.forget(read, input)` erases one read from memory and storage. Its observers see it pending until it is asked for again, and a storage failure rejects. `retire()` now returns a promise that settles once the partition's values, journal and stale marks are deleted, and every call returns the same one. `persist.key`, or its provider, may now be a non-exportable HKDF `CryptoKey` with `deriveKey` usage, so a worker can reopen a key handle kept in IndexedDB.
