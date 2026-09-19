---
'octane': patch
---

Preserve explicit signal ownership when native event handlers are installed by components without signal bindings, including handlers adopted during hydration. Replace stale explicit authority when a new handler is published under its renderer's ordinary scope, while keeping the committed authority if a suspended update is abandoned.
