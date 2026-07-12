# @octanejs/remix-router

[react-router](https://reactrouter.com) for the [octane](https://github.com/octanejs/octane) UI framework.

react-router v7 ships as a single package, so this port **vendors the
framework-agnostic router core byte-close** (loaders, actions, redirects,
matching, history — validated by 161 of upstream's own router unit tests
running against the vendored copy) and transcribes the React layer onto
octane's hooks. The shipped surface matches react-router 1:1 — existing code
works by changing the import.

**The port is complete — full export parity.** Data mode, declarative mode
(`MemoryRouter`, `<Routes>`/`<Route>`, `<Navigate>`), the DOM entry points
(`BrowserRouter`/`HashRouter`, `createBrowserRouter`/`createHashRouter`,
`NavLink`, `useSearchParams`), mutations (`Form`, `useSubmit`,
`useFetcher`/`useFetchers`), guards + scroll (`useBlocker`,
`unstable_usePrompt`, `ScrollRestoration`, `useBeforeUnload`,
`useViewTransitionState`), static SSR (`StaticRouter`,
`StaticRouterProvider`, `createStaticHandler`/`createStaticRouter` on
`octane/server`), and the cookie/session server runtime (`createCookie`,
`createSession`, `createCookieSessionStorage`, …). Framework mode
(`Meta`/`Links`/`Scripts`, `createRequestHandler`) and RSC are permanently out
of scope — those names exist as throwing stubs so
`tests/conformance/parity.test.ts` pins the surface at exact parity
([docs/remix-router-port-plan.md](../../docs/remix-router-port-plan.md) has
the scope policy).

```tsx
// before
import { createBrowserRouter, RouterProvider, Link, useLoaderData } from 'react-router';
// after
import { createBrowserRouter, RouterProvider, Link, useLoaderData } from '@octanejs/remix-router';

const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Home },
      { path: 'users/:id', loader: fetchUser, Component: User, errorElement: <Oops /> },
    ],
  },
]);

function App() @{
  <RouterProvider router={router} />
}

function User() @{
  const user = useLoaderData();
  <h1>{user.name as string}</h1>
}
```

## Entry points

| import | what you get | notes |
| --- | --- | --- |
| `@octanejs/remix-router` | the vendored core surface (matchPath, redirect, data, …) + `createMemoryRouter`, `RouterProvider`, `Outlet`, `Await`, `Link`, `useLinkClickHandler`, the full read-hook family (`useLoaderData`, `useNavigate`, `useNavigation`, `useRouteError`, …), declarative mode (`MemoryRouter`, `Routes`/`Route`, `Navigate`, `createRoutesFromChildren`/`Elements`), the DOM layer (`createBrowserRouter`/`createHashRouter`, `BrowserRouter`/`HashRouter`/`unstable_HistoryRouter`, `NavLink`, `useSearchParams`), mutations (`Form`, `useSubmit`, `useFormAction`, `useFetcher`/`useFetchers`), guards/scroll (`useBlocker`, `ScrollRestoration`, …), static SSR (`StaticRouter`/`StaticRouterProvider`/`createStaticHandler`/`createStaticRouter`), and cookies/sessions (`createCookie`, `createCookieSessionStorage`, …) | full parity |
| `@octanejs/remix-router/dom` | `RouterProvider` with octane's `flushSync` wired in | mirror of `react-router/dom` |

## How it works

- The router core under `src/lib/router/` is vendored verbatim from
  react-router 7.18.1 (`scripts/vendor-remix-router.mjs`; two documented
  type-only deviations; hand-edits prohibited).
- `RouterProvider` preserves upstream's exact commit paths — `startTransition`
  wrapping, the `flushSync` option, and the ViewTransition dance (dormant until
  Phase E) — on octane's `useState`/`useLayoutEffect`/`useOptimistic`/
  `startTransition`/`flushSync`.
- `errorElement`/`useRouteError` run on octane's `@try/@catch` (octane has no
  class components); `<Await>` suspends through octane's `use()` with
  upstream's TrackedPromise decoration kept verbatim, so `useAsyncValue`/
  `useAsyncError` are unchanged. Render-prop children work via octane's
  `isChildrenBlock` guard.
- `<Routes>` accepts BOTH children forms: descriptor children
  (`createRoutesFromElements`, `{expr}` arrays) are walked upstream-style,
  while the natural `.tsrx` block-children authoring goes through a
  registration collector — each `<Route>` registers its config in a pre-paint
  layout effect, so the first paint already shows the matched route.
  Registration order is mount order, which differs from upstream's source
  order only for `matchRoutes` score ties (pinned + documented).
- Refs are props (no `forwardRef`); hooks are keyed by octane's
  compiler-injected per-call-site slots, forwarded through every custom hook.

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
