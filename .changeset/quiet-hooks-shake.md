---
'octane': patch
---

Keep custom-hook path resolution out of client bundles that only use direct component hooks. Nested and manually forwarded custom hooks retain the same state identity and argument behavior.
