---
'octane': patch
---

Preserve keyed rows when a root render clears a list, mounts its `@empty` arm, refills the list, and then suspends. The empty arm now parks only its own DOM, so rollback keeps the original rows connected and reusable, including after a large owned-list clear.
