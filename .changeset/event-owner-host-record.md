---
'octane': patch
---

Mount rows with event handlers without per-row weak-map bookkeeping. A module that can receive signal handles recorded each native handler's signal authority in two weak maps, so every mounted row paid two weak-map insertions even when no signals were in use, which made prepending 100 rows to a 1,000-row keyed list about 1.6 times slower. The authority now lives on the host beside its handler, and a scope's published-authority mark is a field on the scope. Updating a text hole with a plain value in such a module also writes the text directly instead of going through the signal binding path.
