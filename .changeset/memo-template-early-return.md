---
'octane': patch
---

Fix a crash when an exported or escaped `memo` component written with `@{ … }` switches between its template and an early `return null`.
