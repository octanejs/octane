---
'octane': patch
---

Fix production memo regions and cached `@for` lists leaving a context consumer stale when it renders through a tag bound in the component body, such as `const C = props.comp; <C />` or `{ comp: C }`, or when a component returns an element it received, such as `if (props.on) return props.content`. That component now records its context reads, and a cached list refreshes rows that render such a tag or a value hole like `{item.content}`.
