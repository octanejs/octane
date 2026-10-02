---
'octane': patch
---

When a component call finds no server range of its own, because the server rendered another `@if` or `@switch` arm there, and hydration adopts the server markup in place, a component call inside that component's template now adopts the server node at its own position. Previously, when the server had rendered that inner call's markup inline, the inner call rendered against the first server node of the outer template instead: it reported a mismatch and replaced that node, which the outer component had already adopted.
