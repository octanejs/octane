---
'octane': patch
---

Remove an `@if` or `@switch` arm's content when a deferred hydration retry
resumed a component inside it.

A `<Hydrate>` boundary whose captures change while it is pending builds new
content on the client. If an arm in that content suspends before inserting
anything, the next retry renders the suspended component first, then its
parents. The arm still treated the component's output as its siblings' content,
so closing the arm later, in that retry or after it, left the output in the
document. The retry now marks that output as the arm's own.
