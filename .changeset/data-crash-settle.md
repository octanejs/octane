---
'octane': patch
---

Settle octane/data writes that were in flight when a shared data worker crashed. Once a tab reconnects to the new worker, it looks up the receipt of each journaled write it shows as uncertain and keeps or rolls back the edit, never resending it. The worker looks each receipt up once and gives every tab the same answer, so all tabs settle the write the same way. A tab that recovers the journal after a crash no longer picks up writes still in flight through the new worker, and a settled write leaves the journal even when an earlier worker journaled it.
