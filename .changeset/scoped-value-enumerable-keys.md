---
'octane': patch
---

Enumerate a deferred JSX value with the same keys as an ordinary element on the client. A JSX value that Octane defers until it renders also listed Octane's internal `__octaneInvocationSite` field in `Object.keys`, `for...in`, and object spread, so it no longer matched an element from `createElement`. The server already hid this field. The client now hides it too, and the component's call-site identity still reaches its signals during rendering and hydration.
