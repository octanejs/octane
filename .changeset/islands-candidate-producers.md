---
'octane': patch
---

Islands-only pages no longer download the code that stages resources and derived values inside a `startTransition` Action, about 900 bytes gzip. Under the `octane-islands` condition it now ships with the renderer, alongside the signal Action frame. In the default build it ships only in bundles that create a resource or a derived value. Actions stage resource and derived reads the same way in both builds.
