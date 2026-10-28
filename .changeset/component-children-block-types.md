---
'octane': patch
---

The `.tsrx` type view now types a DOM component's template children as the children block (a render function) they compile to, so a component declaring e.g. `children: string` is a type error instead of a runtime `TypeError`. Value-position JSX, a sole render-prop function child, `descriptorChildren` tags and universal renderers keep their authored children. Octane's `@tsrx/oxc` parser peer moves to 0.23.0.
