---
'octane': patch
---

Discard stale server text when hydrating a renderable `{expr}` hole beside other
children whose server value was text but whose client value is a list, a
fragment, a keyed element, or a portal, or a component that returns an element
or a list. Hydration kept the server text next to the client value, so the
content appeared twice (a portal's hole kept collecting text on later renders),
and nothing was reported. The hole now removes the server text, reports the
recovery to `onRecoverableError` once, names its source location (or the
returning component's) in the development hydration-mismatch warning, and the
rest of the root keeps hydrating. A dormant `<Hydrate>` boundary whose props
changed before it activated still repairs the hole without reporting it.
