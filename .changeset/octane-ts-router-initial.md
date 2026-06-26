---
"@octane-ts/router": patch
---

New package: `@octane-ts/router` — [TanStack Router](https://tanstack.com/router) for the octane renderer.

Like `@octane-ts/query`, it re-exports `@tanstack/router-core` verbatim and reimplements only the React binding on octane's hooks. The seam is router-core's reactive store: `createRouter` supplies the client store factory (`createAtom`/`batch` from `@tanstack/store`), whose atoms are bound to octane's `useSyncExternalStore` by `useStore`; the match tree renders pull-based via `RouterProvider` → first match → each route's `<Outlet/>` chaining the next match through `matchContext`. v1 covers code-based routing — `createRouter`/`createRootRoute`/`createRoute`, `RouterProvider`, `Outlet`, `Link`, `Navigate`, the read hooks (`useRouter`/`useRouterState`/`useLocation`/`useParams`/`useSearch`/`useLoaderData`/`useMatches`/`useNavigate`), `ScrollRestoration`, `Await`/`useAwaited` + `defer` (streaming deferred data), and `lazyRouteComponent` (lazy/code-split route components) — consumed identically from `.tsrx` and React-style `.tsx`. Deferred: file-based routing + codegen, devtools, search-param middleware, `useBlocker`, SSR head/scripts.
