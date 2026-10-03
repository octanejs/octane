---
'octane': patch
---

Reorder keyed lists without journaling every row. During a root render that can still be rolled back, a keyed reorder recorded each surviving row's previous position, four journal slots per row. Rotating a 1,000-row list was about 1.4 times slower than before root renders became undoable. The list's own shape record now restores each row's position from its original order on rollback. Recording the key order for that record also uses a single bulk copy. Rows that render their index still show the right position after a held render retries.
