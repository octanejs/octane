---
"octane": patch
---

In opt-in Strong mode, add compiler errors when a built-in hook value and its dependent effect are declared outside the sole nested `@{…}` block that uses them, or a named native event handler is declared outside the sole deeper block containing its direct event use. Permit parent-owned hooks in conditional and keyed arms, plus inline and same-scope named handlers, including shorthand event attributes. Report the source declaration and suggested block location in compiler and editor diagnostics.
