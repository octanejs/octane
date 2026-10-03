---
'octane': patch
---

Plain `.ts` and `.js` modules emit fewer custom-hook call boundaries. A call to a hook the module declares gets no `withSlot` boundary when that hook reads no slot, calling nothing but `useContext` and other such hooks. The same holds for a hook's only use when another module-declared hook makes it directly, provided that caller is used only by name and the omitted calls form no cycle. Every call still keeps its own state. Signal-reading modules and `$` hooks keep every boundary. Across the repository's bindings, this removes 37 boundaries.
