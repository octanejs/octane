---
'octane': patch
---

A watched signal rendered directly in a text or attribute hole can now publish its current value synchronously from its `watched` callback. The write no longer throws `SignalWriteError`, the DOM shows the published value, and the subscription is released on unmount.
