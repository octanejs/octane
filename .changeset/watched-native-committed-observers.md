---
'octane': patch
---

Start watched signal subscriptions only when a native render commits, keeping speculative and retry reads quiet.
