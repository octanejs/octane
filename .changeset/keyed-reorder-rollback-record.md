---
'octane': patch
---

Reorder keyed lists as fast as before 0.10.1 when every row moves.

0.10.1 made keyed swaps and removals cheaper by recording only the rows they
relink, so an abandoned render can put the list back. A reorder takes that record
before it knows how many rows it will move. When it then moved every row, as a
rotation or a move of a group of rows to the other end does, turning the record
into a full copy cost two extra Maps per reorder and, for a list that had been
reordered before, a `Set` of every row. The record now gets its links at the
first relink, so a record that has seen no relink is copied directly, at the
cost a full copy had before 0.10.1. It is also kept in its own undo entry rather
than in a separate per-render Map.

In the js-framework reorder benchmark (1,000 rows, octane-tsrx, Chromium, paired
samples), rotating the rows and moving 3 to 8 rows to the end are 22–27% faster,
within 5% of the runtime before 0.10.1. Swaps, inserts and removals keep their
0.10.1 gains. The production framework bundle is about 137 bytes smaller.
