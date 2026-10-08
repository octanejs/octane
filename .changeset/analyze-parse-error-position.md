---
'@octanejs/cli': patch
---

Point `octane analyze` parse failures at their line and column, and drop the
parser's own `(line:column)` from the message.

A failure whose `loc` is a `{ start, end }` range was reported at 1:1. That
covers template diagnostics such as two outputs in one code block, and every
parse failure from `@tsrx/oxc` before 0.20. A syntax error that ends its message
with its position repeated it, as in `2:11  Unexpected token (2:10)`.
