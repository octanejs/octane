---
'octane': patch
---

A root whose returned component's server markup has no hydration range, which
only a server other than Octane's renders, no longer adopts that markup as if
it had one: as for any other markup that does not match the client render, the
root renders on the client and reports one recoverable error. Octane's server
renders a root's returned component in a range of its own, which hydration
adopts as before.
