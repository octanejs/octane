---
'octane': minor
---

Add `createDataOwner` and `createReplica` to `octane/data`: one owner makes every request and holds every feed connection for several replica stores connected over message ports, the first step toward one store per account across tabs. Replicas share equal reads in flight, show a value another replica loaded, show each other's writes before the reply with the same confirmation or rollback, and settle an uncertain write everywhere once one replica settles it.
