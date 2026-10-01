---
'octane': patch
---

A delegated event listener that the browser runs synchronously during a render's
DOM writes, such as `onBlur` when a render disables or removes a focused input,
can now write signals. Before, it inherited the render's signal write guard and
threw `SignalWriteError`. Its reads no longer become dependencies of that render.
Subscribers notified by its writes also run outside the render, so they can
write signals and their updates schedule like any other event's. The rest of the
render stays write-guarded, and a listener called from inside a pure computation
is still rejected.
