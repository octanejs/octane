---
'octane': patch
---

Keep keyed `@for` rows live when they read module state or mutable globals.

A row that reads a module `let`/`var`, a reassigned module function, or a
host or application global such as `location` or `window` no longer takes the
PURE or DEP-PURE survivor skip. Neither item identity nor the deps tuple can
witness those reads, so an unchanged row stayed stale after the value changed.
For example, `@if (location.pathname === item.href)` never moved the active
row. Since #1213 this also affected rows whose only control flow is a
host-only `@if`. Rows reading module `const`s, unreassigned functions, and
standard language globals such as `Math` keep the fast path.
