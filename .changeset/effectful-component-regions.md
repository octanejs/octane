---
"octane": patch
---

Reuse production component regions containing eligible effectful TSRX children when their inputs are unchanged. Preserve live imported values, refs, effect cleanup, hydration and interrupted-render retries without requiring an explicit memo wrapper.
