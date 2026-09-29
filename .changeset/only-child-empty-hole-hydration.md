---
'octane': patch
---

Discard stale server text when hydrating a renderable `{expr}` hole that is its
host element's only child and whose client value renders nothing (`null`,
`undefined`, `false`, `true`, or `''`). Hydration kept the server's text, so a
later value rendered beside it (`<div>AB</div>`) and nothing was reported. A
`null` value in the root component recovered only by abandoning hydration for
the rest of the root, which duplicated the text of a later only-child hole. The
hole now removes the server content, reports the recovery to
`onRecoverableError` once, and names its source location in the development
hydration-mismatch warning. A dormant `<Hydrate>` boundary whose props changed
before it activated still repairs the hole without reporting it.
