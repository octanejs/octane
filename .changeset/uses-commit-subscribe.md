---
'octane': patch
---

`useSyncExternalStore` now subscribes a newly mounted reader, or a swapped store, during the commit of a discrete event (delegated or native listener) or `flushSync` update rather than after paint, as React does. A store change between that commit and the next paint is no longer missed (#3095).
