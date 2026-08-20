---
'octane': patch
---

Preserve server-rendered descriptor components when a suspended Hydrate boundary
resumes. Avoid false hydration mismatch reports while continuing to remove
genuinely unmatched server content.
