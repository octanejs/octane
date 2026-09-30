---
'octane': patch
---

Report a compile error for a `break` or `continue` that would leave a `@{ … }`
block, such as `if (done) continue;` in a child block inside an `@for` row. The
parser accepted it because the jump sits lexically inside the loop, but every
target compiles the block apart from that loop, so the module failed to load
with "Illegal continue statement". A block is a nested template, not a directive
arm, so it has no early exit. Skip the row with `continue;` in the row's setup
before its output, or render the part to leave out from an `@if` arm.

A labeled `break` or `continue` that would leave a directive arm, for a label in
the setup around it, failed to load the same way and is now a compile error too.
