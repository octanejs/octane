---
'octane': patch
---

Stop allocating a closure for every transition and delegated event.

Since async signals, each `startTransition` call created a native candidate
resolver closure. Each delegated event handler invocation also created a
callback closure, even when it did not enter another signal owner. The
transition resolver is now a module function that reads the active Action
batch. The handler callback is created only when the event enters a different
signal owner.
