---
'octane': patch
---

Write an unset or string `style` directly in signal-enabled modules instead of
allocating a native style Block for it.

A module that imports `octane/signals` compiles every non-literal style, such
as a forwarded `style={props.style}`, to a native style binding, because the
value might carry signal handles. The binding allocated and rendered its own
Block even when the value was `undefined`, `null` or a string, which has
nothing to read. A production audit of a signed-out home page found 273 such
Blocks in one hydration, about 8 ms at 4x CPU throttling. These values are now
written like an ordinary style, during client renders and when hydration takes
over an early binding's host. The Block is allocated only once a structured
value arrives, and then stays, so a later unset style releases its signal
subscriptions transactionally.

Also fixes hydration of a binding view whose early binding claimed its style:
a scalar style literal such as `style={{ opacity: props.opacity }}` in a
signal-enabled module made hydration throw, and the host was rebuilt on the
client.
