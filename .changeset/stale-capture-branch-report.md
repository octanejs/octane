---
'octane': patch
---

Stop reporting a hydration mismatch when a `@switch` or `@if` case changes
because a `<Hydrate>` boundary's props changed before it activated.

When a boundary's captures change before it activates, the server HTML predates
the client's state, so hydration builds the changed case on the client without a
report. A case whose first node is an element or a component still called
`onRecoverableError` and logged "the client expected <b> but the server
rendered …" in development. This happened when the case changed while the
boundary was pending after it had adopted the server's case, or when an early
activation rendered a different case than the server. Those cases are now
quiet, like fragments, text, and lists already were. A case the server did not
render is still reported when the captures are unchanged.
