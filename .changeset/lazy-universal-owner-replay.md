---
'octane': patch
---

Build universal owner replay identities only when pending memos need them. Ordinary native renderer updates no longer allocate identity indexes and replay paths for every nested component.
