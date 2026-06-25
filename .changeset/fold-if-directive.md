---
'octane': patch
---

A return-JSX (or `@{}`) host element containing an `@if` or `@for` directive now folds into the return-based fragment model: the directive's branch/item/empty bodies are compiled inside the component (preserving their closure over setup locals/props), and the control inputs (condition, items, branch/item/empty functions, dep-pure deps) thread into the hoisted renderer as `props.hN` holes — the `@for` key function stays module-hoisted. The folded output is byte-identical to the inline form on the client, SSRs identically, and hydrates by adopting the server markup (verified incl. keyed reconciliation). First directives in the `@{}`→fragment unification; `@switch`/`@try` follow the same shape.
