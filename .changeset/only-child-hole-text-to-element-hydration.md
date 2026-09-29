---
'octane': patch
---

Discard stale server text when hydrating a renderable `{expr}` hole that is its
host element's only child and whose client value is an element, a component, or
a list. In the root component, hydration gave up on the rest of the root, so a
later only-child hole rendered its text twice (`<b>tt</b>`) and the development
warning named the wrong cause. In a nested component, the value rendered beside
the server text and nothing was reported. The hole now removes the server text,
reports the recovery to `onRecoverableError` once, names its source location in
the development hydration-mismatch warning, and the rest of the root keeps
hydrating. A value that suspends is reported and built once when its boundary
retries, a textarea keeps its server text as its default value, and a dormant
`<Hydrate>` boundary whose props changed before it activated still repairs the
hole without reporting it.
