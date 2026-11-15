---
'octane': patch
---

Give compiler-proven independent `<Hydrate>` islands their own boundary entry in production builds. The page that hosts them never renders their children, so a hydrated page with only independent islands no longer ships the Suspense implementation.
