---
'@octanejs/remix-router': patch
---

Make the published router source typecheck in an application that enables
`noUnusedLocals` or `noUnusedParameters`.

This package ships source, so the application's compiler checks it under the
application's own flags. The router core is vendored from react-router 8.2.0,
and upstream keeps type-level test aliases, an unread local, unread private
fields, and unused parameters in it. The vendoring script now removes the test
aliases and the unread local, and prefixes the unused parameters with `_`. It
also makes the unread `error` and `internal` fields of `ErrorResponseImpl`
(exported as `UNSAFE_ErrorResponseImpl`) `protected` instead of `private`,
which keeps them inaccessible from outside the class. `Await` and
`FetcherWithComponents` drop or prefix their own unused bindings the same way.
Runtime behavior is unchanged.
