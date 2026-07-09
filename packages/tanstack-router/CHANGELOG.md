# @octanejs/tanstack-router

## 0.1.2

### Patch Changes

- Updated dependencies [71b5167]
- Updated dependencies [7b2acbd]
- Updated dependencies [a000fa2]
- Updated dependencies [71b5167]
- Updated dependencies [735f5ca]
- Updated dependencies [634c4b4]
- Updated dependencies [1987d47]
- Updated dependencies [fda2200]
- Updated dependencies [71b5167]
- Updated dependencies [fda2200]
- Updated dependencies [3431ec3]
- Updated dependencies [3afe217]
- Updated dependencies [1a1f1db]
- Updated dependencies [3431ec3]
- Updated dependencies [5e3858f]
- Updated dependencies [d2afbbb]
- Updated dependencies [1987d47]
- Updated dependencies [eb48930]
- Updated dependencies [3431ec3]
- Updated dependencies [87c5bc3]
  - octane@0.1.3

## 0.1.1

### Patch Changes

- cc2bca1: `<Link>` now forwards arbitrary props (`data-*`, `aria-*`, `title`, `id`, `role`,
  `style`, extra event handlers, etc.) onto the rendered `<a>`, matching react-router.
  Previously only a fixed allow-list (routing props + `ref`/`class`/`className`/
  `children`) reached the anchor and everything else was dropped. The routing props
  (`to`/`params`/`search`/`hash`/`replace`/`target`) and active-state attributes still
  take precedence over any same-named pass-through prop.
- 214b8e0: New package: `@octanejs/tanstack-router` — [TanStack Router](https://tanstack.com/router) for the octane renderer.

  Like `@octanejs/tanstack-query`, it re-exports `@tanstack/router-core` verbatim and reimplements only the React binding on octane's hooks. The seam is router-core's reactive store: `createRouter` supplies the client store factory (`createAtom`/`batch` from `@tanstack/store`), whose atoms are bound to octane's `useSyncExternalStore` by `useStore`; the match tree renders pull-based via `RouterProvider` → first match → each route's `<Outlet/>` chaining the next match through `matchContext`. v1 covers code-based routing — `createRouter`/`createRootRoute`/`createRoute`, `RouterProvider`, `Outlet`, `Link`, `Navigate`, the read hooks (`useRouter`/`useRouterState`/`useLocation`/`useParams`/`useSearch`/`useLoaderData`/`useMatches`/`useNavigate`), `ScrollRestoration`, `Await`/`useAwaited` + `defer` (streaming deferred data), and `lazyRouteComponent` (lazy/code-split route components) — consumed identically from `.tsrx` and React-style `.tsx`. Deferred: file-based routing + codegen, devtools, search-param middleware, `useBlocker`, SSR head/scripts.

- 6ca5fa6: Navigation is now concurrent: the router drives its navigation state commits
  through octane's `startTransition` (`Transitioner` sets
  `router.startTransition = (fn) => startTransition(fn)`, replacing the previous
  synchronous `(fn) => fn()`). When the next route suspends (a `useSuspenseQuery`,
  loader, or `use(promise)`), octane keeps the currently-committed page on screen
  until the new route's data resolves instead of immediately flashing the route's
  pending fallback, so navigations no longer cause a skeleton flash.
- b680431: Improve `<Link>` compatibility by composing user click handlers, respecting `reloadDocument` and `disabled`, and applying basic `activeProps`/`inactiveProps` with search/hash-aware active matching.
- 85fa133: Same-route search-param navigations (e.g. `?page=1` → `?page=2`) now commit
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

- Updated dependencies [c19f1aa]
- Updated dependencies [6983478]
- Updated dependencies [6983478]
- Updated dependencies [169c7c6]
- Updated dependencies [86ae0c5]
- Updated dependencies [357f841]
- Updated dependencies [6675ac7]
- Updated dependencies [f414710]
- Updated dependencies [894d51c]
- Updated dependencies [f44fb6b]
- Updated dependencies [056c441]
- Updated dependencies [aa9cc6e]
- Updated dependencies [0f57f20]
- Updated dependencies [f44fb6b]
- Updated dependencies [067efa3]
- Updated dependencies [f0c6c4d]
- Updated dependencies [dd24fd5]
- Updated dependencies [524939e]
- Updated dependencies [e8ee0a8]
- Updated dependencies [b680431]
- Updated dependencies [524939e]
- Updated dependencies [7f8dbc0]
- Updated dependencies [a13acd1]
- Updated dependencies [067efa3]
- Updated dependencies [524939e]
- Updated dependencies [894d51c]
- Updated dependencies [894d51c]
- Updated dependencies [1960647]
- Updated dependencies [e8ee0a8]
- Updated dependencies [93e2733]
- Updated dependencies [149800c]
- Updated dependencies [6983478]
- Updated dependencies [6983478]
- Updated dependencies [6983478]
- Updated dependencies [169c7c6]
- Updated dependencies [bbc3275]
- Updated dependencies [ed6afad]
- Updated dependencies [40bcb16]
- Updated dependencies [c842fb7]
- Updated dependencies [c62efa7]
- Updated dependencies [524939e]
- Updated dependencies [b3a9191]
- Updated dependencies [ffe32c4]
- Updated dependencies [e1f996b]
- Updated dependencies [6983478]
- Updated dependencies [fc36e15]
- Updated dependencies [524939e]
- Updated dependencies [405f06e]
- Updated dependencies [f50c829]
- Updated dependencies [b3a9191]
- Updated dependencies [dd24fd5]
- Updated dependencies [7042056]
- Updated dependencies [6983478]
- Updated dependencies [e031a7d]
- Updated dependencies [86ae0c5]
- Updated dependencies [a33cdd6]
- Updated dependencies [067efa3]
- Updated dependencies [fab1cb0]
- Updated dependencies [6983478]
- Updated dependencies [dd24fd5]
- Updated dependencies [149800c]
- Updated dependencies [6983478]
- Updated dependencies [cb9ad82]
- Updated dependencies [ea6352e]
- Updated dependencies [1987bd7]
- Updated dependencies [0c4d5a1]
- Updated dependencies [dd24fd5]
- Updated dependencies [fcac573]
- Updated dependencies [41aa22a]
- Updated dependencies [c842fb7]
- Updated dependencies [6983478]
- Updated dependencies [6983478]
- Updated dependencies [634fd52]
- Updated dependencies [149800c]
- Updated dependencies [aafaaa9]
- Updated dependencies [1987bd7]
- Updated dependencies [74cbff9]
- Updated dependencies [894d51c]
- Updated dependencies [0040cad]
- Updated dependencies [a3dce2f]
- Updated dependencies [3656e32]
- Updated dependencies [43d940d]
- Updated dependencies [a032c5c]
- Updated dependencies [7f8dbc0]
- Updated dependencies [c71d4f3]
- Updated dependencies [a3dce2f]
- Updated dependencies [c2f3f69]
- Updated dependencies [3656e32]
- Updated dependencies [1987bd7]
- Updated dependencies [f42e5b7]
- Updated dependencies [cc2bca1]
- Updated dependencies [6983478]
- Updated dependencies [1987bd7]
  - octane@0.1.2
