---
'octane': patch
---

When hydration rebuilds an element whose server markup does not match, the
`@if`, `@switch`, `@for`, `@try`, `<Activity>`, and `<ErrorBoundary>` blocks
inside the rebuilt element now mount as client content. They used to keep
hydrating against the server output that follows the mismatch. Development
builds logged a second, false mismatch for the same recovery, an `@for` could
throw, and a block could take a following server element, list range, or
`use()` result as its own, so the rebuilt element showed the wrong content or
went missing. A block mismatch inside an element that hydration adopts from the
server still reports as before.
