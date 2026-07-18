---
'octane': patch
---

Fix TSRX shorthand components that return before reaching their trailing
template. Early values, bare or undefined returns, and trailing compiled JSX now
reconcile through one returned-output path across client rendering and
hydration; folded control-flow cache dependencies stay scoped correctly, and
incompatible HMR edits safely invalidate the module.

Restore feature-level tree shaking for ordinary component boundaries. Built-in
boundary behavior now travels through component capability flags, so rendering a
normal component no longer retains unused Hydrate, Suspense, or ViewTransition
implementations through direct identity checks. Deferred-hydration setup and
ViewTransition scheduler integration now install through retained feature
capabilities, allowing their concrete runtime graphs to disappear from clients
that do not use those APIs.
