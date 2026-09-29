---
'octane': patch
---

Let `prerender` finish when a resource reader keeps rethrowing a thenable that
has already settled until a timer or I/O callback updates its state. These
retries used to run on microtasks, so the render failed after 50 passes before
the callback could run. Once the render has seen that thenable settle, it now
retries on a timer that backs off from 1ms to 100ms. These retries no longer
count toward the pass limit, and a reader that never recovers fails once the
stall lasts `timeoutMs`. When a pass limit is reached on thenables thrown
outside `use()`, buffered and streamed errors now name that cause instead of
`use()`.
