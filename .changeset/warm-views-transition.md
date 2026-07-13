---
'octane': patch
---

Fix `<ViewTransition>` commits started from native discrete event handlers so transition-only work reaches `document.startViewTransition`, including work queued while an animation is already active. Use the broadly supported callback overload of the browser API, and correctly skip asynchronous native transitions when a commit activates no boundary.
