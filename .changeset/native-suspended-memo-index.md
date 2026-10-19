---
'octane': patch
---

Avoid quadratic Promise memo lookup when universal and native renderers suspend and retry many sibling components. Preserve each request's owner identity and dependencies while releasing the lookup index after rendering.
