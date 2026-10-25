---
'octane': patch
---

Move keyed rows with `moveBefore()` where the browser supports it, so a reorder
no longer reloads a row's iframes, restarts its CSS animations, or closes its
open popovers. Browsers without `moveBefore()` keep using `insertBefore()`.
