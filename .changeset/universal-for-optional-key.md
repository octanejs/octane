---
'octane': patch
---

Allow `@for` without a `key` clause on universal renderers.

Universal lowering used to reject `@for (const x of xs)` with "universal @for
ranges require an explicit key", forcing boilerplate on static or throwaway
lists. The universal runtime reconciles ranges by key only — there is no
unkeyed path — so the compiler now synthesizes a positional key
(`(item, index) => index`) when `key` is omitted, matching the implicit-index
semantics an unkeyed list has elsewhere.

An explicit `key` is unchanged and still recommended for reorderable stateful
rows: with a positional key, item state (hooks, component owners, uncontrolled
leaf state) follows the slot rather than the item across reorders. The DOM
renderer is untouched — its unkeyed `@for` continues to fall back to
`x.id ?? x`.
