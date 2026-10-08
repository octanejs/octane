---
'octane': patch
---

Report a file that will not parse with the same error from the Node compiler as
from the browser compiler, by moving the Node parser to `@tsrx/oxc` 0.20.0.

- A syntax error is a `SyntaxError` whose message ends with its position, as in
  `Unexpected token (2:10)`. Its `loc` is that position, `{ line, column }` with a
  zero-based column, and `pos` is its offset. Before, the message had no
  position and `loc` was a `{ start, end }` range, which Vite discards, so Vite
  named the file without a line and column.
- A template diagnostic, such as two outputs in one code block or a redeclared
  binding, is now a plain `Error` with its code and a `loc` range, not a
  `SyntaxError`.
- Messages use `@tsrx/core`'s wording. An unclosed tag reports
  `Unclosed tag '<div>'. Expected '</div>' before end of template.` where the
  closing tag was expected, instead of `unterminated JSX element starting at
  byte N` at the opening tag. A directive written without parentheses, such as
  `@if x { … }`, reports `Unexpected keyword 'if'`.

A `.tsrx` module with a generic call signature in an interface, such as
`<T>(props: Props<T>): Element`, now parses natively instead of falling back to
`@tsrx/core`'s parser. Its compiled output does not change.
