---
'octane': patch
'@octanejs/tanstack-router': patch
---

Commit Router Link's transition cue through Octane's scheduled interaction work before navigation callbacks, while leaving unrelated deferred transition work scheduled.
