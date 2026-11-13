---
'octane': minor
---

Make shared octane/data tabs survive other builds, missing workers and crashes. `createReplica(owner, options)` now takes a local store's options (`transport`, `listen`, `persist`, `seed`, …) and `contracts`, every read, write and feed the app uses, in place of `writes`. The owner serves only tabs whose contracts match the first build it served; any other tab, a tab whose `sharedOwner` returned `null`, and one whose owner cannot record the account carry on as a local store with those options. Tabs and owners check on each other every 5 seconds: a tab whose owner goes silent opens the worker again and asks it what the old one never answered, marking writes that were in flight uncertain rather than sending them twice; an owner drops a silent tab's feed subscriptions. While a tab waits for its owner to confirm the account, `prefetch` waits too, so a suspended reader no longer renders without a value.
