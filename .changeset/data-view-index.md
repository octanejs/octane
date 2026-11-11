---
'octane': patch
---

`octane/data` views now evaluate from a per-view index of the records their window holds, instead of every record of their entity. With 200 views or pages of one entity, loading them all drops from 6–9 s to 0.2–0.3 s, an optimistic edit from 31–45 ms to under 1 ms, and its confirmation from 45–94 ms to under 5 ms.
