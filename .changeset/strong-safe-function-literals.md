---
'octane': patch
---

Keep Strong literal props and ref arrays stable when they contain regular functions that do not depend on their receiver or their own identity. Functions that can mutate their receiver or themselves continue to get fresh values each render.
