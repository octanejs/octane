---
'@octanejs/aria': patch
---

Pass `.tsrx` block children through RAC render props instead of invoking them.

A component authored with octane's `@{ … }` body form compiles its children to a
tagged block function. React Aria Components treats a function child as a render
prop, so every unguarded `typeof children === 'function'` check invoked that
block with render values instead of a scope and threw
`Cannot read properties of undefined (reading 'block')` — breaking the idiomatic
way to author any RAC component in `.tsrx`.

Block children are now detected with `isChildrenBlock` and rendered as ordinary
children at all five sites that consume them: `useRenderProps`,
`composeRenderProps`, `Tabs`, `Popover`, `Select`, and `ComboBox`. A genuine
render prop is still called with its render values. `composeRenderProps` is the
one applications hit most, because it is how a component wraps its own markup
around the caller's children.

Also publishes `Focusable` from `@octanejs/aria/components`. Upstream RAC exports
it from both its hooks and its components entry; this package had it only on the
hooks surface.
