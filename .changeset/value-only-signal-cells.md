---
'octane': patch
---

Make signal writes and reads cheaper. A writable signal, and a derived value whose result is plain and ready, now keeps only its value: writing, recomputing and reading it no longer allocate snapshot objects, which are built only when `snapshot()`, a subscriber or serialization asks for one. A `set()` with no subscribers runs about 3 times faster, and a write that recomputes a derived value about 1.5 times faster. Resource cells now share the same object layout as every other signal.
