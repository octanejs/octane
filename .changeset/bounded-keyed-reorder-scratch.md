---
'octane': patch
---

Reduce temporary allocations during keyed list reorders by safely reusing
bounded numeric scratch buffers across reconciliations.
