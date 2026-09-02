---
'octane': patch
---

Scope `<style>` blocks lexically (RFC tsrx-org/RFCs#1): a block styles the nearest template scope — the component render, a nested `@{ … }` block, each control-flow branch body, or an assigned element/fragment template — several blocks per scope share one hash and one `injectStyle` call, nested scopes get their own hash and CSS is injected in lexical order, `<style>` may sit beside the output node in a code block or directive body, assigned blocks lower anywhere a declaration is legal and expose `$class`, exported or applied blocks keep every selector, `<style apply={theme} />` stamps a theme's classes on a scope, and `{style(expr)}` resolves to the full scope chain.
