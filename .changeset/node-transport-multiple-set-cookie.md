---
'@octanejs/app-core': patch
---

Send every `Set-Cookie` header when a handler's `Response` sets more than one
cookie.

The Node transport copied response headers one `setHeader` call at a time.
`Headers` yields each `Set-Cookie` value as its own entry, and each call
replaced the one before it, so only the last cookie reached the client. A login
response that set both a session cookie and a CSRF cookie sent only the CSRF
cookie. The transport now passes all cookies to Node as one array, which writes
each on its own header line and keeps commas inside a cookie, such as the one in
`Expires`, intact. Other headers are copied as before.

This affects the built-in `createNodeServer`, the generated Node handler, and
the Vite and Rsbuild dev middleware, which all send through the same function.
