---
'octane': patch
---

Clear an owned keyed list of inert host rows with one DOM removal after the root render commits. Retain connected rows for suspension rollback and keep the existing per-row teardown for lists with effects, refs, nested scopes, or portals.
