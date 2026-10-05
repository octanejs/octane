---
'octane': patch
---

Retire an early host binding when hydration replaces a host that was moved
inside the root while its boundary was pending.

Before, the boundary rendered a new host at the original site but left the
moved host's early binding subscribed, so later source notifications kept
writing to the moved element. Committing the replacement now runs that
binding's cleanup, as an accepted handoff would. The moved element keeps its
last published values. A resumed attempt that suspends again leaves the early
binding live until a replacement commits.
