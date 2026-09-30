---
'octane': patch
---

End a directive arm early the same way wherever the exit sits in its setup.
`return null;` is now the same exit as `return;`, and so is an exit inside a
nested `if`, block, `switch`, loop, `try`, or labeled statement. Before, only a
top-level `if (c) return;` (or `continue;` in an `@for` body) was lowered: the
server rendered any other exit's literal `null` or `undefined` as text, and a
client update that took the exit left the arm's earlier output in place.

A keyed `@for` row that can exit early no longer uses its element as the row
boundary, because the row renders no element when it exits. Rows with an exit
could previously crash (`insertBefore` of null) when a hidden row moved, and fail
to update after hydration. The same applies to a row or component whose root is
an `@if`/`@else` with an arm that can exit.

Returning a value from an arm, or a `break` that targets the `@for` or `@switch`
around it, is now a compile error with its location. These previously rendered
`[object Object]` on the server or emitted JavaScript that failed to load.
