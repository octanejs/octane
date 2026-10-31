---
'octane': patch
---

The `.tsrx` type view that the editor and `octane-tsc` check no longer throws on two shapes that already compiled. When it threw, `octane-tsc` checked the raw source instead, reporting syntax errors and skipping every type error in the program. Explicit JSX element type arguments beyond a single name, such as `<Select<string | null>>`, `<Select<string, boolean>>` or `<Select<{ a: string }>>`, now parse, and the element's props are checked against them. A directive arm that ends with `return null;` in a template in expression position, such as a component's children or a nested fragment, is now typed as the exit it compiles to, as `return;` already was.
