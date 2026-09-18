---
'octane': patch
---

Preserve control-flow guards when inferring hook dependencies. Property reads behind a condition, an early return, or exception handling now track their receiver rather than evaluating the property during render. Optional receivers and guarded getters therefore retain their authored behavior.
