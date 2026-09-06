---
'@octanejs/tanstack-router': patch
---

Re-evaluate `useStore` when the selector, atom, or comparator changes.

The previous snapshot cache keyed only on store input. A selector that captured a
route match id could therefore keep the selection computed for the previous id
after navigation had already published the new match list. Nested `Outlet`s went
empty when moving between sibling parameterized routes until reload.
