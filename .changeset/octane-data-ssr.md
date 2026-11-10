---
'octane': minor
---

Server-render pages that read `octane/data` and hydrate from the server's data. `createDataHandler` returns a handler with `transport(request)`, which runs reads and writes in process under the page request's context, so a server render's store loads without HTTP. `store.dehydrate()` returns its loaded values as text safe inside a `<script type="application/json">`, and `createDataStore({ transport, seed })` starts from them: hydration reads the server's values synchronously and loads nothing. A seeded value keeps the age it had on the server, and a value whose schema no longer matches is loaded again. The Octane binding gains a server twin, `octane/data/octane/server`, which server builds import in place of `octane/data/octane`.
