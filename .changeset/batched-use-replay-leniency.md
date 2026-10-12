---
'octane': patch
---

Fix a Suspense boundary that could stay on its fallback forever when a component reads a fresh promise on every render, such as `use(props.source.promise)` through a getter. When the compiler batches such a call, the resumed render now keeps the promise the first render suspended on, as an unbatched `use()` call already did, instead of suspending again on each new promise.
