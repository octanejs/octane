---
'octane': patch
---

Reduce the Suspense retry reveal window from 300ms to 100ms so ready content
spends less time behind a visible fallback. The default hold for already-visible
transition content remains indefinite.
