---
'octane': patch
---

Add `octane/react` (experimental): host a compiled Octane subtree inside a real
React 19 tree through one component — `<OctaneCompat><Island …/></OctaneCompat>`.
React owns the wrapper and one host element; a private hosted Octane root owns
every descendant through the existing renderer-region owner bridge. Local Octane
`@try`/Suspense/error boundaries win first; only an unhandled island suspension
or error escapes to the nearest React Suspense/error boundary (React reveals
only after the Octane retry has committed). Events stay native and delegated at
the island host, the child `ref` passes through as an ordinary Octane ref prop,
unchanged parent re-renders skip the island update, and StrictMode probes and
Suspense hide/reveal preserve the hosted root while real unmounts dispose it
exactly once. React and ReactDOM 19 are optional peer dependencies; the entry
carries `'use client'`. Not yet included (see
docs/react-hosted-octane-compat-plan.md): transparent React context, island
SSR/hydration, and selective per-island event delegation.
