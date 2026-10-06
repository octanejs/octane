---
'octane': patch
---

Refresh a memoized `use()` argument when the receiver of an inherited method call changes. `use(load(count.toFixed(1)))` used to depend on `count.toFixed`, which is `Number.prototype.toFixed` for every number, so it kept showing the first `count`. It now tracks `count`, and the same applies to plain TypeScript hooks and server prop creations. An own function, arrow or not, still tracks only itself, so `use(props.load(id))` keeps its request when the parent rebuilds `props` around the same `load`.
