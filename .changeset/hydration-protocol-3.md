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
passes its children to the server as a children block, as the client does. On
the client, a component's returned value renders inside the component's own
markers on a fresh mount too, so it adds no anchor comments.

Hydration now adopts by structure. The server frames every component call, and
a client call whose range the server did not render is a structural mismatch:
the nearest Suspense or `<Hydrate>` boundary, or the root, renders on the client
and reports one recoverable error, and the development warning names the call
site. React adopts such a tree when its DOM happens to match, as when the server
rendered another branch that renders a component's elements inline. As in
React, a suspension in a component's body still keeps the server HTML until it
resolves.

The seed script names the new version (`data-octane-suspense="3"`). A root whose
server rendered another version renders on the client and reports error 345
through `onRecoverableError`, so deploy the server and the client from the same
Octane version.
