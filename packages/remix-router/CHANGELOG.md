# @octanejs/remix-router

## 0.1.7

### Patch Changes

- Updated dependencies [f7e1cba]
- Updated dependencies [082b681]
- Updated dependencies [9d86d20]
- Updated dependencies [082b681]
- Updated dependencies [742ae9d]
- Updated dependencies [2932a23]
- Updated dependencies [e0c2f09]
- Updated dependencies [082b681]
- Updated dependencies [082b681]
  - octane@0.1.11

## 0.1.6

### Patch Changes

- Updated dependencies [d426046]
- Updated dependencies [f511024]
  - octane@0.1.10

## 0.1.5

### Patch Changes

- Updated dependencies [c704664]
- Updated dependencies [5b7d9ed]
- Updated dependencies [5b7d9ed]
- Updated dependencies [91b5f45]
- Updated dependencies [c16778a]
- Updated dependencies [39f2c00]
- Updated dependencies [aabf79c]
- Updated dependencies [07511e4]
- Updated dependencies [5b7d9ed]
- Updated dependencies [0d2e265]
- Updated dependencies [3168360]
- Updated dependencies [81c8842]
  - octane@0.1.9

## 0.1.4

### Patch Changes

- Updated dependencies [156f213]
- Updated dependencies [2a5f44f]
- Updated dependencies [f8e94f2]
- Updated dependencies [a12a3d9]
- Updated dependencies [1b21731]
- Updated dependencies [7a123d2]
- Updated dependencies [95b3081]
- Updated dependencies [38d95eb]
- Updated dependencies [ba36091]
- Updated dependencies [6ccdbce]
- Updated dependencies [d1bb5c3]
- Updated dependencies [9c21887]
- Updated dependencies [674f1a4]
- Updated dependencies [6ceab55]
- Updated dependencies [3445fa6]
- Updated dependencies [6cfb63d]
- Updated dependencies [c68562b]
- Updated dependencies [4de2b4f]
- Updated dependencies [6868005]
- Updated dependencies [1b21731]
- Updated dependencies [1b21731]
- Updated dependencies [1b21731]
- Updated dependencies [7efdbdd]
- Updated dependencies [314b38d]
- Updated dependencies [dcd2707]
- Updated dependencies [d63b0d0]
- Updated dependencies [39e779c]
- Updated dependencies [1b21731]
- Updated dependencies [f07c628]
- Updated dependencies [fac1c66]
- Updated dependencies [dbbcee1]
- Updated dependencies [5287eac]
  - octane@0.1.8

## 0.1.3

### Patch Changes

- Updated dependencies [eaacd17]
- Updated dependencies [93dcb81]
- Updated dependencies [6852df7]
- Updated dependencies [b00cd74]
- Updated dependencies [e9852d4]
  - octane@0.1.7

## 0.1.2

### Patch Changes

- fb03e8c: Upgrade the React Router port from 7.18.1 to 8.2.0, including the v8 router
  core, middleware and error-boundary semantics, instrumentation types,
  cookie-es runtime, and upstream dependency requirements.
- d173805: Preserve compiler-driven state-hook getters on client and server while keeping
  getter-free calls on the existing two-item path, including bounded server
  render-phase updates and immediate getter reads. Isolate `useId` by root with
  working identifier prefixes. Harden first-reveal ViewTransitions and compiler
  hook discovery for aliases, namespaces, dependency inference, and plain-loop
  errors.

  Consume Octane as an exact singleton peer from every framework binding and
  publish a Node 22 minimum engine requirement across core and the bindings.
  Compile installed raw-source binding graphs through Vite while preserving
  manifest-declared manual hook-slot directories.

- Updated dependencies [d173805]
- Updated dependencies [85e589e]
- Updated dependencies [2979f42]
- Updated dependencies [b41a91a]
- Updated dependencies [e55f6ed]
- Updated dependencies [d173805]
- Updated dependencies [813fd50]
  - octane@0.1.6

## 0.1.1

### Patch Changes

- 62da8cc: New binding: a COMPLETE react-router 7.18.1 port for octane at full export parity — the framework-agnostic router core is vendored byte-close (validated by 161 of upstream's own router unit tests); the data-mode React layer (createMemoryRouter, RouterProvider incl. the /dom flushSync variant, Outlet, Await on octane's use(), errorElement boundaries on @try/@catch, Link + useLinkClickHandler, and the full read-hook family) and the declarative layer (MemoryRouter, Routes/Route in both descriptor and .tsrx block-children forms — the latter via a registration collector — Navigate, createRoutesFromChildren/Elements, the UNSAFE_With\*Props wrappers) and the DOM layer (createBrowserRouter/createHashRouter, BrowserRouter/HashRouter/unstable_HistoryRouter, NavLink with isActive/isPending render props, useSearchParams), the mutation layer (Form on native submit, useSubmit incl. JSON encTypes, useFormAction, useFetcher/useFetchers incl. fetcher.Form and shared keys), guards + scroll (useBlocker, unstable_usePrompt, ScrollRestoration, useBeforeUnload, useViewTransitionState, unstable_useRoute/useRouterState), static SSR (StaticRouter/StaticRouterProvider/createStaticHandler/createStaticRouter through octane/server), and the vendored cookie/session server runtime are transcribed onto octane, differential-verified byte-identical against real react-router across nested layouts, loader data, redirects, error boundaries with reset, Await, deterministic pending-navigation state, declarative block-children navigation, NavLink active states + search-param round-trips, Form GET/POST/JSON submissions + the full fetcher lifecycle, the useBlocker lifecycle, and static-SSR markup vs react-dom/server. Framework mode + RSC are permanently out of scope (throwing stubs). Scope policy: docs/remix-router-port-plan.md.
- Updated dependencies [940ae5a]
- Updated dependencies [6fceaf3]
- Updated dependencies [62da8cc]
- Updated dependencies [e737057]
  - octane@0.1.5
