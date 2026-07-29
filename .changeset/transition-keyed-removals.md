---
'octane': patch
---

Hold a keyed list whole through a suspended transition.

A transition that dropped a row and then suspended used to lose the row from the
held screen: the list reconciled first, the boundary decided to hold second, and
by then the row's DOM, state and cleanups were already gone. A list the boundary
was supposed to be holding frozen showed up with rows missing.

Removals inside a boundary now defer their teardown while a hold is still
possible. The nodes come out of the way so the reconcile can finish, but they
are kept, and the row's scope — its state, its effects, its cleanups — is left
untouched until the outcome is known. If the boundary holds, the rows come back
exactly as they were, cleanups never having run; once the transition commits,
the removal goes through for real and cleanups fire then.

The list restores as a whole — order, membership and the `@empty` branch
together — so reorders roll back alongside removals.
