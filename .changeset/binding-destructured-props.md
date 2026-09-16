---
'octane': patch
---

Support flat destructured props, aliases, primitive literal defaults, and rest bindings in renderer-free authored views. Prepare parameter bindings once per snapshot so projection, event, and ref reads preserve JavaScript destructuring semantics. Keep unsupported patterns and arbitrary native spreads explicit errors.
