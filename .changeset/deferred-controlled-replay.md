---
'octane': patch
---

Restore controlled inputs after queued hydration events and layout-triggered
updates finish. Accepted drafts survive replay, and rejected edits return to the
controlled value even when a render or commit throws.
