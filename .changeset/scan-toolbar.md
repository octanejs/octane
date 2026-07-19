---
'@octanejs/scan': patch
---

Add the scan toolbar: a floating shadow-DOM pill with a live render counter,
pause/resume toggle, and animation-speed cycle, honoring `showToolbar`
(detaches on `false`, re-attaches with the counter intact). Deliberately
plain DOM the profiler cannot see — the same self-instrumentation rationale
that has upstream react-scan render its UI in Preact rather than React.
