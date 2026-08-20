---
'octane': patch
---

Preserve server-rendered descriptor components when a suspended Hydrate boundary
resumes. Claim fallback cleanup ranges only after adoption completes, avoiding
false hydration mismatch reports while preserving template-owned checks and
removing genuinely unmatched content added during suspension.
