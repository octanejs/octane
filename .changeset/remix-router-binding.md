---
'@octanejs/remix-router': patch
---

New binding (phased): react-router 7.18.1 for octane. Phase 0 + A + Link shipped — the framework-agnostic router core is vendored byte-close (validated by 161 of upstream's own router unit tests), and the data-mode React layer (createMemoryRouter, RouterProvider incl. the /dom flushSync variant, Outlet, Await on octane's use(), errorElement boundaries on @try/@catch, Link + useLinkClickHandler, and the full read-hook family) is transcribed onto octane, differential-verified byte-identical against real react-router across nested layouts, loader data, redirects, error boundaries with reset, Await, and deterministic pending-navigation state. Roadmap: docs/remix-router-port-plan.md.
