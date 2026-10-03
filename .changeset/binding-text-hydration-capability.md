---
'octane': patch
---

Keep the hydration range-marker validator out of apps that never call
`hydrateRoot`. A dynamic `{x}` text hole that may hold a signal handle
previously retained the binding-marker protocol in every client bundle, about
600 B gzip. Adopting a binding view's server text range is now a hydration
method, so client-only apps drop it. Hydration behavior is unchanged.
