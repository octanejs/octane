---
'octane': patch
---

A lone `{expr}` in a `@{ … }` body or a directive arm (`@if`/`@else`, `@for`/`@empty`, `@try`/`@pending`/`@catch`) is now a compile error. In that position it parsed as a JavaScript block around a dead expression, so the arm silently rendered nothing; for example, `@try { {children} } @catch (e) { … }` dropped its children. The error points at the block and says to render it as `<>{children}</>`. `@case` arms already read a leading `{` as a hole and are unchanged.
