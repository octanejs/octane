---
"octane": patch
---

Keep deferred JSX external-store reads live across repeated updates, preserve updates to memoized children while Suspense hides them, and retain committed error fallbacks until a suspending reset can replace them.
