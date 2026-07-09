---
'@octanejs/tanstack-router': patch
---

Not-found rendering, per TanStack Router semantics. An unknown URL now renders the not-found UI inside the layout chrome: router-core flags one match `globalNotFound` (the deepest fuzzy-matched route with children by default, the root with `notFoundMode: 'root'`), that route's component still renders, and its `<Outlet/>` renders the not-found UI instead of a child match. A loader/beforeLoad that throws `notFound()` renders the boundary route's not-found UI in place of its component (`status === 'notFound'`), with the NotFoundError spread onto it (`notFound({ data })` arrives as the `data` prop). Component resolution matches react-router's `renderRouteNotFound`: route `notFoundComponent` → router `defaultNotFoundComponent` → the generic `<p>Not Found</p>`. Previously `notFoundComponent` was accepted but never rendered — an unknown URL showed the layout with an empty outlet.
