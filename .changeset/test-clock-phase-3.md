---
'octane': patch
---

`installTestClock()` now also owns server-side deadlines: the SSR suspense deadline (`timeoutMs`), the stalled-reader backoff and its deadline, streamed-signal budgets, server-function batch and stream timeouts, the server-function client's invocation deadline, `octane/data`'s server long-poll lifetime and the React-hosted SSR timeout. A test can advance past a minute-long render deadline at once. SSR's macrotask yield, which waits for real I/O to land, stays on real time.
