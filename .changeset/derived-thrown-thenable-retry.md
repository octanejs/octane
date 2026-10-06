---
'octane': patch
---

Run a `derived$` computation again once the thenable it threw settles, instead
of leaving an async reader retrying the settled wait without end.

A synchronous `derived$` that throws a promise is pending until that promise
settles. Settling it woke the value's readers, but the computation never ran
again. An async `derived$` that awaited the value with `read()` then read the
same settled wait on every microtask, which froze the page. The computation now
runs again when the promise it threw settles, and readers that subscribe to the
value are notified. A computation that throws a promise that has already settled
stays pending until a signal it reads changes.
