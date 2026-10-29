---
'octane': patch
---

A `root.render` inside `startTransition` that suspends into a Suspense boundary showing committed content now holds the whole screen until the new tree is ready, as a hook-driven transition already did. Before, the root's new props committed at once, so content outside the boundary showed the new screen beside the old one. A `useSyncExternalStore` notification while the transition waited also checked the new tree's selector, so the visible selection stayed stale or fell back to `@pending`. The held screen now keeps its committed props and selector, a store notification updates it in place, and the request renders again when its data settles. A later `root.render` replaces the held request.
