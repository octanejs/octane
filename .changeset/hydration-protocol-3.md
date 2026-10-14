---
'octane': minor
---

Change the server HTML that hydration reads (hydration protocol version 3). A
value a component returns now renders directly inside that component's comment
range instead of in a second range of its own, as do the values of the
components it returns in turn: a component returning `<em>` serializes as
`<!--[--><em>…</em><!--]-->` rather than `<!--[--><!--[--><em>…</em><!--]--><!--]-->`.
Pages carry fewer comment nodes.

The seed script names the new version (`data-octane-suspense="3"`). A root whose
server rendered another version renders on the client and reports error 345
through `onRecoverableError`, so deploy the server and the client from the same
Octane version.
