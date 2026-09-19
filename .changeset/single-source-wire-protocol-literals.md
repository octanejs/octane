---
'octane': patch
---

Give every hydration wire literal exactly one owning module. The `@for` arm
markers, the presentation-binding comment prefixes, the deferred-boundary
attribute names, the `useId` spelling, the element-scoped `<ViewTransition>`
stylesheet, and the cross-realm `Symbol.for` tags were each re-typed in two to
five modules, so a change on one side of a hydration boundary could diverge from
the other without any test noticing. They now live in `hydration-markers.js`
(which stays off the `dom-tables.js` graph so the pre-root capture bundle can
share them), `dom-binding-protocol.js`, `css.js`, and a new `runtime-tags.js`;
`octane/constants` re-exports the same names and values as before.

Adopting a presentation view whose range carries no view id is now rejected
outright instead of being compared against the string `"[b;undefined;root"`.
