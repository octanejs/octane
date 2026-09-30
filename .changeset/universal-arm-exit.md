---
'octane': minor
---

End a directive arm early on universal renderers the same way as on the DOM. A
`continue;` in an `@for` row that no inner loop owns, at any nesting depth, now
ends that row. Before, it reached the arm's compiled function unchanged and the
module failed to load with "Illegal continue statement".

A `break` that targets the `@for` or `@switch` around an arm failed to load the
same way. It is now the DOM compiler's compile error, with its location.

Returning a value from an arm, such as `if (loading) return <Spinner />;`, used
to render that value on universal renderers and is now the same compile error as
on the DOM. An arm's output is its final node on every renderer, and a component
can mix DOM and universal regions across a renderer boundary. If the rule
differed by renderer, the same arm would compile on one side of a boundary and
fail on the other. Render the alternative from an `@if`/`@else` arm instead.
