---
'octane': patch
---

Let `renderToPipeableStream` and `renderToReadableStream` finish when a resource
reader keeps rethrowing a thenable that has already settled until a timer or I/O
callback updates its state. A lag longer than about 50 event-loop turns used to
fail the stream after 50 passes. These retries now back off on the same timer as
`prerender`, do not count toward either streaming pass limit, and stop waiting
as soon as another boundary's data arrives. A reader that never recovers fails
once the stall lasts `timeoutMs`. When the pass limit before the shell is
reached on thenables thrown outside `use()`, the shell error now names that
cause.
