---
'octane': patch
---

Let Strong-mode keyed `@for` rows that log with `console` skip re-rendering again.

Since the change that keeps rows reading module state or mutable globals live,
a row body containing a diagnostic call such as `console.log('row', item.id)`
also lost its survivor skip, because `console` is a host global. Every console
operation returns undefined, so the receiver of a statement-position
`console.method(…)` call cannot reach row output. Strong production builds now
reuse those rows again, as documented. The call's arguments are still row
reads. A module binding named `console` still disables the skip.
