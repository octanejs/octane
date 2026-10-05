---
'octane': patch
---

Run a `derived$` computation again once the thenable it threw settles, instead
of leaving an async reader retrying the settled wait without end.

A synchronous `derived$` that throws a promise is pending until that promise
settles. Settling it woke the value's readers, but the computation never ran
again. An async `derived$` that awaited the value with `read()` then read the
same settled wait on every microtask, which froze the page. This also happened
when a component's body redeclared the value to throw a different promise while
reading the same signals, and the earlier promise settled first. The computation
now runs again when the promise it threw settles, and readers that subscribe to
the value are notified. A redeclared definition waits on the promise it threw,
not the one it replaced. A computation that throws a promise that has already
settled stays pending until a signal it reads changes.
