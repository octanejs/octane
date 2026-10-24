---
'octane': patch
---

Universal renderers now compile JSX outside a recognized component, as the DOM
target does: module values, registry and registration callbacks, and components
declared inside factories, callbacks, or multi-declarator statements lower to
universal plans instead of failing with "JSX in an unsupported module
declaration".
