---
'octane': patch
---

Keep sibling `@if`, `@switch`, and component slots in source order at the root
of a fragment body.

A body made only of directives and component calls, such as a component's root
fragment, an `@if` or `@switch` arm, a `@try` body, or a `@for` row, has no
template, so every slot in it inserted before the body's shared end marker. An
`@if` or `@switch` taking an empty arm, or a hookless component rendering one,
keeps no DOM of its own. When it later rendered content, that content landed
after every later sibling: `<>@if (a) {<span/>} @if (b) {<em/>}</>` rendered
`<em>` before `<span>` once `a` turned on. A slot emptied while a later sibling
rendered could also throw `NotFoundError` after that sibling unmounted.

The compiler now marks each such slot that has a later sibling, and the slot
gets a comment of its own at its source position when a client render creates
it. Hydration is unchanged: a hydrating slot adopts the server's range.
