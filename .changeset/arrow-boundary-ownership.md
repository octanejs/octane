---
'octane': patch
---

Support directive values in module-level callbacks, including arrow components returning `@try` / `@pending` / `@catch` with concise bodies or explicit `return` statements. Keep callback parameters, local values, and lexical `this` and `arguments` available to the rendered branches without requiring an `@{}` wrapper.
