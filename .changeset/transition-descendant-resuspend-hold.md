---
"octane": patch
---

A transition-priority re-suspend of a DESCENDANT under a `@try`/`@pending`
(Suspense) boundary that already has committed content now HOLDS the previous
content instead of flashing the `@pending` fallback — matching React's
`useTransition` "stale screen stays" contract. Previously the hold fired only
when the boundary's OWN body re-suspended; a child component that re-rendered on
its own (its own state update inside a transition) and re-suspended on a
per-value `use(thenable)` / `useSuspenseQuery` would flash the fallback. The
common case is a router route paginating via a search-param change inside a
navigation transition: the current page now stays on screen until the next page
is ready, with `isPending` held true throughout. A non-transition descendant
re-suspend still soft-detaches and shows the fallback, unchanged.
