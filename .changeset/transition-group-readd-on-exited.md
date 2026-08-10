---
'@octanejs/transition-group': patch
---

Keep TransitionGroup survivors when `onExited` synchronously re-adds the same child key, matching upstream deferred cleanup.
