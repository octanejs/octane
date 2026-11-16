---
'octane': patch
---

`OctaneCompat` now disconnects the island's layout effects and refs while a React Suspense boundary shows its fallback, and reconnects them on reveal. Passive effects and store subscriptions stay connected, as they do for React components.
