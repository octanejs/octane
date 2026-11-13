---
"octane": patch
---

Keep distinct wire inputs in separate cache entries and reconnect retained handles to the current read after eviction. After upgrading, cached reads refill on first use and feeds reconnect with fresh cursors. Pending writes remain recoverable from their original receipts.
