---
'octane': patch
---

Mount `memo()` rows without extra comment markers.

A component whose body renders one element uses that element as its own
boundary when another module renders it, including as the only child of a
keyed `@for` row. A `memo()` wrapper around such a component did not inherit
that, so every memoized row added four comment nodes: an item pair and a
component pair. Mounting and clearing 1,000 memoized rows cost up to a third
more than the same rows without `memo()`. `memo()` wrappers now carry their
component's single-root mark, in development and production builds alike,
so memoized and plain rows build the same DOM. A static-hoisting
higher-order component that copies the wrapper's statics does not inherit
the mark.
