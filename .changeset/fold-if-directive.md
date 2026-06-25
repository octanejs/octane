---
'octane': patch
---

Return-JSX (and `@{}`) host elements containing control-flow directives — `@if`, `@for`, `@switch`, `@try` — now fold into the return-based fragment model. The directive's branch/item/case/try bodies are compiled inside the component (preserving their closure over setup locals/props), and the control inputs (condition, items, discriminant + cases array, branch/item/case/try/catch/pending functions, dep-pure deps) thread into the hoisted renderer as `props.hN` holes; the `@for` key function stays module-hoisted. The folded output is byte-identical to the inline form on the client, SSRs identically, and hydrates by adopting the server markup (verified for each directive incl. keyed reconciliation and the error-boundary path). This is the directive groundwork for collapsing `@{}` and `return <jsx>` onto one component model.
