---
'octane': patch
---

Strong mode now rejects `event.currentTarget` read after an event handler has returned: after an `await`, or in a timer or promise callback (`OCTANE_STRONG_DEFERRED_CURRENT_TARGET`). The read is empty there; capture the element at the top of the handler.
