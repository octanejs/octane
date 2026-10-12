---
'octane': patch
---

Fix a production memo region skipping a context update below a pure callee that renders a prop value as a child, such as `{props.content}` holding an element whose component reads context. The region now refreshes that consumer when the context changes.
