---
"@octanejs/codemod": patch
---

Report React Intl scalar formatter calls in inline React memo calculators and lazy state initializers. These callbacks can call into the original React renderer during render.
