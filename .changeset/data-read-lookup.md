---
'octane': patch
---

Make `store.read(read, input)` cheaper when it's called on every render, as `useRead(useDataStore().read(...))` does. A read that is already held is found without encoding its input, for an omitted input, a primitive, or a plain object of primitives. Equal inputs still share one handle, and other inputs are encoded as before. A read whose `keep` is too long for a timer to wait, such as `Infinity`, is now kept for the session instead of being evicted at once.
