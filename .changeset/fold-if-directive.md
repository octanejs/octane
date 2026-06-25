---
'octane': patch
---

A return-JSX (or `@{}`) host element containing an `@if` directive now folds into the return-based fragment model: the directive's branch bodies are compiled inside the component (preserving their closure over setup locals/props), and the condition + branch functions thread into the hoisted renderer as `props.hN` holes. The folded output is byte-identical to the inline form on the client, SSRs identically, and hydrates by adopting the server markup. First directive in the `@{}`→fragment unification; `@for`/`@switch`/`@try` follow the same shape.
