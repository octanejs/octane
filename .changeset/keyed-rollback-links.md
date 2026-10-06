---
'octane': patch
---

Swap and remove keyed rows faster. Every update keeps enough to put a keyed list back if the render is abandoned, and it used to copy the whole row list and its key order to do so, even for a two-row swap. Inserts, removals and small reorders now record only the few rows they relink, and rollback walks the old order back through them. In the js-framework benchmark, swapping two of 1,000 rows is 17% faster and removing a row 22% faster. Development builds also keep the full copy and check that the two agree.
