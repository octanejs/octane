---
'octane': patch
---

`useSyncExternalStore` now subscribes a newly mounted reader, or a swapped store, during the commit rather than after paint, so a store change between the commit and the next paint is no longer missed (#3095).
