---
'@octanejs/remix-router': patch
---

New binding (phased): react-router 7.18.1 for octane. Phases 0 + A + B + Link shipped — the framework-agnostic router core is vendored byte-close (validated by 161 of upstream's own router unit tests); the data-mode React layer (createMemoryRouter, RouterProvider incl. the /dom flushSync variant, Outlet, Await on octane's use(), errorElement boundaries on @try/@catch, Link + useLinkClickHandler, and the full read-hook family) and the declarative layer (MemoryRouter, Routes/Route in both descriptor and .tsrx block-children forms — the latter via a registration collector — Navigate, createRoutesFromChildren/Elements, the UNSAFE_With*Props wrappers) are transcribed onto octane, differential-verified byte-identical against real react-router across nested layouts, loader data, redirects, error boundaries with reset, Await, deterministic pending-navigation state, and declarative block-children navigation. Roadmap: docs/remix-router-port-plan.md.
