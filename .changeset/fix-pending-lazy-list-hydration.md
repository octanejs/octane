---
'octane': patch
---

Preserve matching server-rendered list ranges when hydration resumes a pending lazy child. First-fill adoption now starts inside the list's retained range, and only first-fill adoption discards extra server items. Genuine list mismatches still report recoverable errors and remove the extra items.
