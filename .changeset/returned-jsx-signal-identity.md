---
'octane': patch
---

Resume server-resolved signals such as `query$` when their component renders
inside JSX that a parent returns with `return <…/>` rather than an `@{}` body.
The browser used to call its own loader, replace the server text, and report a
hydration mismatch, for two reasons. A component placed beside a directive in a
returned fragment or host element compiled to a different call-site id on each
side. Children of a returned fragment, array, or keyed element also missed
their list position in the server's signal identity. Both sides now agree, and
explicitly keyed de-opt children no longer serialize a JSON key per item on the
server.
