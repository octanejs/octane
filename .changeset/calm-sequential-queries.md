---
"@octanejs/tanstack-query": patch
---

Keep sequential suspense queries pending until each query has data instead of reusing an earlier query's fulfilled replay slot.
