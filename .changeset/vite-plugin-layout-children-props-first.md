---
'@octanejs/vite-plugin': patch
---

Fix the generated client hydration entry for routes with a layout. The layout's `children` ComponentBody was emitted with the old scope-first calling convention (`(s) => Component(s, { params })`), but octane's client runtime invokes a function child props-first as `({}, block, extra)` — so the page received the block as its props and rendered without its route data. The closure now calls `Component({ params }, scope, extra)`.
