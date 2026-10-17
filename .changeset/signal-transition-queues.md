---
'octane': minor
---

Signal writes inside `startTransition` keep their fork semantics on the same
update queues as `useState`. A signal written in a transition keeps its
committed value for committed reads, subscriptions and DOM bindings, and gains
one pending value that the transition's renders and its synchronous callback
read. Those renders suspend, hold and commit with the transition's state
updates, and an urgent write rebases as a state update does. Two transitions
that write the same signal now commit together, as React entangles transitions
that update one queue; a later transition no longer replaces an earlier one's
write. A transition whose boundary shows its timeout fallback renders the rest
of its work in the next task, after the fallback commits.

Apps that use signals with transitions ship about 9.4 kB raw and 2.8 kB gzip
less framework code. Compiled DOM binding views and their controls drop the
transition preview path that no transition reaches any more, and ship 0.3 to
1.2 kB gzip less.
