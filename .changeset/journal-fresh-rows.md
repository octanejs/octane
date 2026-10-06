---
'octane': patch
---

Mount and clear rows with less undo bookkeeping. Every update records the bindings it writes so it can undo them if the render is abandoned. Event handlers and class names written into rows that the same render created no longer get undo entries, because abandoning the render discards those rows whole. Mounting 1,000 keyed rows makes 14% fewer calls and runs about 5% faster. Clearing a large list no longer makes a function call per row while it checks that the old rows are still in place.
