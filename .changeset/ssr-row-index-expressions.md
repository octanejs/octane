---
'octane': patch
---

Initialize the index before destructuring an authored `@for` item on the server when a binding default or computed key reads that index inside a larger expression, such as `value = index + 1`, `value = id + index`, or `[index + 1]: value`.
