---
'octane': patch
---

Make a change to an `octane/data` store cost the same however many reads the store holds. A feed event, an optimistic write and a settled write now go straight to the reads that show the changed record, instead of checking every read the store holds: with 5,000 reads held, receiving one record takes about a microsecond rather than 0.6 ms.
