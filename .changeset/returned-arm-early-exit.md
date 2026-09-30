---
'octane': patch
---

Lower an early exit inside a directive arm the same way under returned JSX as in
a template body. For `return <div>@if (x) { if (c) return; <b /> }</div>`, the
client kept the arm's `return` as a literal JavaScript return, while the server
rendered the rest of the arm as a nested range. Hydration reported a mismatch and
rebuilt the subtree. A client update that took the exit also left the arm's
earlier output in place. The same applied to `@else`, `@switch` cases, and
`return` in `@for` bodies, and to directives inside JSX values stored in
setup.
