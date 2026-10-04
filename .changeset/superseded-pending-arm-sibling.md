---
'octane': patch
---

Keep a replaced sibling's content when an `@if` or `@switch` arm that suspended
inside a Suspense primary is superseded.

An arm that suspends before inserting anything owns no DOM. It used to remember
the node in front of it, which belongs to a sibling. A keyed component, keyed
`@for` row, or `@if`/`@else` arm beside it can replace that node, or stage its
replacement right after it, before the arm renders again. A later update that
dropped the arm then swept the sibling's new content away. In
`@try { <Child key={id} /> @if (wait) { <Hold /> } }`, rendering A, then B with a
pending promise, then A again left the boundary without a child (#1698). A retry
that resolved after such a replacement also bounded its content from a detached
node, so its content outlived the arm.

A pending arm with no DOM now reads its bound from its insertion anchor when it
renders again. A retry that inserts content and then suspends again owns that
content, the same as a first mount.
