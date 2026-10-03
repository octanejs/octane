---
'octane': patch
---

Render a server `@try` boundary without allocating a closure per boundary.

`ssrTry` built a small arrow on every call to label a presentation-binding
view's arm. It is now a module-level helper, so each boundary on each server
pass allocates one fewer closure. The emitted HTML is unchanged.
