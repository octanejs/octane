---
'octane': patch
---

Skip the per-row `updateSurvivor` call in keyed reconciliation when a compiler-pure list row is provably unchanged — same item reference, same body, same position — so a stable keyed update no longer pays the survivor-update machinery for every no-op row. Moved, added, removed, index-shifted, non-pure, and de-opt rows still take the full survivor path, preserving render, journal, and rollback behavior.
