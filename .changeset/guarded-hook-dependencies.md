---
'octane': patch
---

Preserve control-flow guards when inferring hook dependencies. Property reads behind a condition, an early return, or exception handling inspect own data values without invoking getters during render. Accessors and inherited properties track their receiver, while stable own fields and callbacks retain precise dependencies across fresh props and store snapshots. Optional receivers and guarded getters therefore retain their authored behavior.
