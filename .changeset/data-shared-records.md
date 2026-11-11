---
'octane': minor
---

`octane/data` reads that only the server can order, such as search results, now share records with views. Such a read keeps the order and membership it was sent. When it loads, it gives the views any newer copy of a record they hold, which can move that record within a view. In turn, it shows any copy of a record newer than its own load, whether a view, another read, or a write's `record` brought it. A read whose shared records did not change keeps the same snapshot, including while one of its edits is pending.
