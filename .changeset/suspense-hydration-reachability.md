---
'octane': patch
---

Stop shipping Suspense hydration in applications that hydrate without Suspense. `hydrateRoot` no longer bundles the Suspense boundary machinery (`mountTry`, catch switching, Activity and hidden-reveal paths) unless the application renders a Suspense or `@try` boundary, which saves about 9 kB gzip on a minimal hydrating client.
