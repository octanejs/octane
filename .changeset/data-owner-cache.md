---
'octane': minor
---

Give shared octane/data tabs one encrypted cache. `serveDataOwner` and `createDataOwner` take `persist: (account) => PersistOptions`, and the owner becomes the only writer of the signed-in account's cache and write journal. A replica created with `persist` forwards its persistence calls to the owner, so every tab shares one cache and one budget, no tab overwrites another's newer value, a reloaded tab starts from the cache, and after a restart only the first tab recovers the journal, so each write's receipt is looked up once. Signing out, or another account signing in, clears the account's cache. A replica uses its own `persist` only once it carries on as a local store.
