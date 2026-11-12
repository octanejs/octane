---
"@octanejs/codemod": patch
---

Require a known React Intl provider before migrating a formatter’s locale property read, so custom getters can still emit React DOM resource hints during server rendering.
