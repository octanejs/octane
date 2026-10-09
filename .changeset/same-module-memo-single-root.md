---
'octane': patch
---

Mount same-module `memo()` components without extra comment markers.

A `const Row = memo(RowImpl)` rendered in the module that declares it now
mounts the same DOM as an imported one. A keyed `@for` row or a template child
whose component renders one element uses that element as its own boundary, so
1,000 memoized rows no longer add up to 4,000 comment nodes. A local `Row` that
shadows the module binding keeps the marked path, because it can name a
different component on each render.
