---
'octane': minor
---

Keep the state of a hook declared after an early exit on the DOM renderer. A
hook's state lasts as long as the component, `@for` row, or directive arm that
calls it; an exit only skips the rest of one render. On the DOM renderer, the
rest of a directive arm after `return;`, `return null;`, or `continue;`, and the
rest of a component whose early return guards a single host element, ran in a
scope of its own. So taking the exit reset every hook after it, while the
universal renderer, value-returning components, custom hooks, and plain `if`
blocks kept that state. The DOM compiler now keeps it too: only the arm's output
is removed when the exit is taken. An effect after the exit is still cleaned up
while renders skip it and runs again once one reaches it.

A class declared in setup is also passed to the directive arms nested below it
on the client, where reading it threw a `ReferenceError`.
