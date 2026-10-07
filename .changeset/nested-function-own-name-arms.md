---
'octane': patch
---

Fix a client `ReferenceError` when a nested `@{}` function renders itself by its
own name from an `@if`, `@for`, `@switch`, or `@try` arm, as in
`memo(function Counter(props) @{ … @if (props.more) { <Counter /> } })`. The
client compiler moves those arms to module scope and passes each value they read
from the enclosing function as an argument. The function's own name was left
out. A function expression binds that name only inside itself, so the moved arm
could not resolve it. The same applied to a function declared in a nested block
inside a component. The arm now receives the name like any other local. Server
rendering was already correct, and client output now matches it for render and
hydration. Module-level component declarations compile exactly as before.
