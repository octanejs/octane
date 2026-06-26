---
"@octanejs/router": patch
---

Same-route search-param navigations (e.g. `?page=1` → `?page=2`) now commit
within the concurrent-navigation transition, so a suspending page/search change
HOLDS the current view until the new one is ready — matching cross-route
navigation instead of flashing the route's pending fallback.

The router's reactive store factory now performs every commit inside octane's
`startTransition`. router-core already wraps navigation in `router.startTransition`
(Transitioner), but it commits the RESOLVED matches inside `startViewTransition`,
whose update callback a real browser defers to a later task — by then octane's
transition window has closed, so the `__store`/match commit scheduled an URGENT
re-render of the suspending route component, and an urgent suspend does not hold.
Re-asserting the transition at commit time makes that re-render ride the
navigation transition. Non-navigation router commits are unaffected in practice
(router stores are only ever mutated by router internals) and SSR is unchanged.
