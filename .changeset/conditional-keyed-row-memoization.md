---
'octane': patch
---

Skip unchanged keyed-list rows in production when their nested conditional
content contains only host elements and every captured dependency is stable.
Preserve conditional ownership, hydration, transitions, and existing keyed
selection behavior while avoiding redundant DOM updates in TodoMVC-shaped apps.
