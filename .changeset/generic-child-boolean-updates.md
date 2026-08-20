---
'octane': patch
---

Keep boolean renderable children empty when updated from text, and correctly
reapply anchored child text after a held transition resumes. Explicit string
conversion and typed text bindings retain their existing coercion semantics.
