---
'octane': patch
---

Fix a `use()` call that could commit another call's value after a Suspense boundary resumed. When a promise resolved in the same task as a state or store update that changed which `use()` calls a component makes, the resumed render could hand a later call the promise an earlier call had stored. A component with an update queued since the suspended render, and everything it renders, now re-renders as that update.
