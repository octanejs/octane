---
'octane': patch
---

A child `@{ … }` block written directly in a directive body with no element
around it, such as `@if (x > 0) { @{ const y = x + 1; <b>{y}</b> } }`, now
renders on the client and the server, and hydrates. This covers `@if`,
`@else`, `@switch` cases, `@try`, `@pending`, `@catch`, `@for`, and `@empty`
bodies. The compiler used to treat the block as a setup statement and discard
it, so the body rendered nothing. The block is now that body's output, as it is
among element children. A render-only block groups its output transparently. A
block with setup runs in its own render scope, can read the body's own locals,
and keeps its hook state across parent updates.
