---
'octane': patch
---

Index conditional JSX return value uses once per module so component-heavy
TSRX modules no longer repeat a full AST scan for every component.
