---
"octane": patch
---

Keep eligible Strong ref arrays stable within entered conditional and keyed render scopes, so unrelated updates do not restart ref observers. Changed refs and removed branches still clean up normally.
