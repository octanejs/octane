---
'octane': patch
---

Adopt instance-keyed server signal state inside independent `<Hydrate>` islands.

The client island adapter recreates the server's Hydrate frame as a component
scope, and that scope added its own invocation segment to every descendant's
signal instance key. The server renders island children directly under the
island's root key, so a component inside `<Hydrate independent>` computed a
different key on each side. Instance-keyed server state, such as a `query$`
result, was then never adopted: activation ran the browser producer again. The
frame now resolves to the island's root key, so client and server keys match
with or without an `@try` around the component.
