---
'octane': patch
---

Shrink compiled client output: template strings leave out what the HTML parser restores on its own (quotes a value does not need, empty values, an HTML void element's `/`, and the close tags that end a template), a text hole seeds its committed value inside its mount call, a handler bundle compares inline without a temporary, and a template commits at its end by testing the bag's state word alone. The parsed DOM, the runtime calls a render makes, and SSR output are unchanged.
