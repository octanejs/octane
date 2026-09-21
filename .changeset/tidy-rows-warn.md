---
'octane': patch
---

Keep eligible intrinsic `@for` row roots on the native template path when an explicit root `key` supplies the row key. This preserves keyed reordering, uncontrolled input state, and hydration adoption without the redundant descriptor boundary. Existing key precedence and component key boundaries remain unchanged.
