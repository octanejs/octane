---
'octane': patch
---

Fence octane/data's shared owners by account. A data worker now records the origin's signed-in account and a generation in IndexedDB before any tab hears of it, and announces changes on a BroadcastChannel. When another account signs in, or a tab's `retire()` signs the account out, every tab of the old account is retired, and nothing it had in flight reaches one. A late sign-out never undoes a newer sign-in. A tab resuming from being frozen shows its reads as pending until its owner confirms the account, and a tab whose sign-out is not yet confirmed asks again until it is.
