---
'octane': patch
---

Run the mount effects of components a boundary rendered but never committed.

A `useEffect` could be lost outright. When a Suspense boundary suspended on
something rendered *after* a sibling — a `@for` of children followed by a
component that calls `use()` on a pending promise, say — those earlier siblings
had already run their hooks before the attempt was abandoned. Their effects were
queued and then dropped along with the rest of the aborted attempt, but the
slots kept the dependency arrays that attempt had stamped. When the promise
resolved and the content was revealed, the re-render compared those deps, found
them unchanged, and enqueued nothing. The mount body never ran, and neither did
the cleanup it would have returned, so subscriptions, timers, and observers set
up in `useEffect` silently never started. `useLayoutEffect` was unaffected.

Hiding a boundary behind its fallback still leaves passive effects subscribed,
which is what React does for content that is on screen and merely hidden. That
now applies only to effects that actually ran. One that never ran has no
subscription to preserve, so it resets like a layout effect and fires when the
boundary finally commits — React fires every mount effect in the subtree when a
suspended mount lands.

This also covers a boundary that commits, then re-renders with a new child and
suspends: the new child's effects mount on reveal while its already-committed
siblings keep the subscriptions they had.
