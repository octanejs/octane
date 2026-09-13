---
'octane': patch
---

Invalidate cached output when a retained Context Provider switches compiled child bodies, so returning to an earlier body renders its current content while preserving mounted DOM and hook state.
