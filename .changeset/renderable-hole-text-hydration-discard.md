---
'octane': patch
---

Discard stale server content when hydrating a renderable `{expr}` hole whose
client value is text or empty. If the server rendered an element, component, or
list into the hole but the client rendered a string, number, `null`, or
`undefined`, hydration kept the server's content next to the client value
through every later render and reported nothing. The hole now keeps at most one
server text node, removes the rest, reports the recovery to `onRecoverableError`,
and names the hole's source location in the development hydration-mismatch
warning. A dormant `<Hydrate>` boundary whose props changed before it activated
still repairs the hole without reporting it.
