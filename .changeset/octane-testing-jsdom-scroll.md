---
'octane': patch
---

Add `octane/testing` with `clampJsdomScrollTop()`, an opt-in helper that clamps
jsdom's stored scroll position to its reported range and dispatches the
resulting native scroll event.
