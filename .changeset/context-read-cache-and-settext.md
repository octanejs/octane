---
"octane": patch
---

Performance: faster context reads and text updates.

- `use(Context)` now caches the resolved provider per consumer, so repeat reads are an O(1) live-value lookup instead of an O(depth) walk up the scope/block tree. Removing the per-read walk also keeps the shared property inline-caches monomorphic, which speeds up the surrounding render path. On a deep-tree context-fan-out benchmark (1024 consumers re-reading a root context) this cut the full-tree update from ~3.0ms to ~1.6ms.
- `setText` no longer reads `node.data` back before writing. The compiler already guards every text-binding update with a previous-value check, so the read only re-confirmed a known change while materializing a throwaway string from the DOM each call — pure CPU and GC overhead on text-heavy updates.

No API or behavior changes.
