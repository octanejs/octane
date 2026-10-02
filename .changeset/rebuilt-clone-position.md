---
'octane': patch
---

Keep a component root that hydration rebuilt after a mismatch where the server
node it replaced stood.

When a component's template root did not match the server node at that
position, hydration reported the mismatch and rebuilt the root on the client,
but inserted it at the end of its range. Server siblings that later components
adopted then rendered before it, and server content after it that no client
sibling claimed stayed on the page. The rebuilt root now takes the replaced
node's place. Unclaimed server content after it in the same `@if` or `@switch`
arm is removed as part of the one reported mismatch. A `@switch` or `@if` that
the server did not render keeps the rebuilt root inside its own range. A text
hole after the rebuilt root no longer throws `NotFoundError`. A Suspense
boundary that resumes hydration after the rebuild places the root the same way
and keeps the server siblings it adopted.
