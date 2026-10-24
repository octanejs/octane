---
'octane': patch
---

Fix a crash (`Cannot read properties of undefined (reading 'idState')`) when a stored element with a runtime-composed `className`, such as an array, re-rendered inside an `@if` arm.
