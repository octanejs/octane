# @octanejs/remix-router

## 0.1.1

### Patch Changes

- 62da8cc: New binding: a COMPLETE react-router 7.18.1 port for octane at full export parity — the framework-agnostic router core is vendored byte-close (validated by 161 of upstream's own router unit tests); the data-mode React layer (createMemoryRouter, RouterProvider incl. the /dom flushSync variant, Outlet, Await on octane's use(), errorElement boundaries on @try/@catch, Link + useLinkClickHandler, and the full read-hook family) and the declarative layer (MemoryRouter, Routes/Route in both descriptor and .tsrx block-children forms — the latter via a registration collector — Navigate, createRoutesFromChildren/Elements, the UNSAFE_With\*Props wrappers) and the DOM layer (createBrowserRouter/createHashRouter, BrowserRouter/HashRouter/unstable_HistoryRouter, NavLink with isActive/isPending render props, useSearchParams), the mutation layer (Form on native submit, useSubmit incl. JSON encTypes, useFormAction, useFetcher/useFetchers incl. fetcher.Form and shared keys), guards + scroll (useBlocker, unstable_usePrompt, ScrollRestoration, useBeforeUnload, useViewTransitionState, unstable_useRoute/useRouterState), static SSR (StaticRouter/StaticRouterProvider/createStaticHandler/createStaticRouter through octane/server), and the vendored cookie/session server runtime are transcribed onto octane, differential-verified byte-identical against real react-router across nested layouts, loader data, redirects, error boundaries with reset, Await, deterministic pending-navigation state, declarative block-children navigation, NavLink active states + search-param round-trips, Form GET/POST/JSON submissions + the full fetcher lifecycle, the useBlocker lifecycle, and static-SSR markup vs react-dom/server. Framework mode + RSC are permanently out of scope (throwing stubs). Scope policy: docs/remix-router-port-plan.md.
- Updated dependencies [940ae5a]
- Updated dependencies [6fceaf3]
- Updated dependencies [62da8cc]
- Updated dependencies [e737057]
  - octane@0.1.5
