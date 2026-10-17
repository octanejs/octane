---
'octane': minor
---

Change the server HTML that hydration reads (hydration protocol version 3). A
value a component returns now renders directly inside that component's comment
range instead of in a second range of its own, as do the values of the
components it returns in turn: a component returning `<em>` serializes as
`<!--[--><em>…</em><!--]-->` rather than `<!--[--><!--[--><em>…</em><!--]--><!--]-->`.
A component that is a `@for` or `.map()` item's only content now keeps its own
range inside the item's, also when `.map()` runs another collection's `map`
method. A keyed or configured `<Activity>` in a `.tsx` component's returned JSX
passes its children to the server as a children block, as the client does. An
element's only child that is a signal holding text, or a ternary with a JSX arm
in a `.tsx` component's returned JSX, serializes as the element's bare text when
its value is text, as the client renders it. On the client, a component's
returned value renders inside the component's own markers on a fresh mount
too, so it adds no anchor comments.

Hydration now adopts by structure. The server frames every component call, and
a client call whose range the server did not render is a structural mismatch:
the nearest Suspense or `<Hydrate>` boundary, or the root, renders on the client
and reports one recoverable error, and the development warning names the call
site. So does a list, branch or text hole whose server range has another shape:
a list range without its item marker, a range around each row of a list whose
rows are one element each, a branch whose server arm is longer than the
client's, or a range where an element's only child is text. React adopts such a
tree when its DOM happens to match, as when the server rendered another branch
that renders a component's elements inline. As in React, a suspension in a
component's body still keeps the server HTML until it resolves. Every
structural mismatch, a server range without its close included, reaches
`onRecoverableError` as the same `HydrationMismatch` error.

Every hydratable root's server output now opens with a comment naming the
protocol version, `<!--3-->`, whether or not it seeds `use()` values, and so does
an independent `<Hydrate>` island's. Head metadata folded into a fragment root
comes before it, so `head + html` under `headChannel: 'separate'` is still the
folded output. The comment stays in the DOM, as the range comments do. A root
whose server rendered another version, or named none, renders on the client and
reports error 348 through `onRecoverableError`; a root that hydrates an app
container inside a server-rendered document finds the version before `<html>`.
Deploy the server and the client from the same Octane version.
