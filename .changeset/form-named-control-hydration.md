---
'octane': patch
---

Hydrate a form whose controls are named after element methods, such as
`<input name="getAttribute">`.

A form exposes its named controls as properties, and they shadow methods like
`getAttribute` and `matches`. Hydration read the form's attributes through that
property and threw `getAttribute is not a function`, so the boundary rebuilt the
form on the client and dropped a submission accepted before hydration.
Independent hydration's mutation observer failed the same way on `matches`.
Both now call the element prototype's methods.
