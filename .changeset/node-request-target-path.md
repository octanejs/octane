---
'@octanejs/app-core': patch
'@octanejs/vite-plugin': patch
'@octanejs/rsbuild-plugin': patch
---

Keep a request path that starts with `//` on the request's own host. The Node
bridge resolved the raw request target against the request origin, so a target
such as `//evil.example/x` (or `/\evil.example/x`) became host `evil.example`
and path `/x` in `Context.url`, and the Vite and Rsbuild dev servers routed it
as `/x`. An origin-form target now keeps its whole path and query on the
request origin (the `Host` header, or the trusted proxy's with
`server.trustProxy`) in `nodeRequestToWebRequest`, the built-in static file
layer, and both dev servers. An `http://` or `https://` absolute-form target
still keeps its own origin. An absolute-form target with any other scheme, such
as `ftp://`, becomes a path under the root instead of a foreign-scheme URL.
`@octanejs/app-core/node` exports `nodeRequestUrl`, the URL the bridge gives a
Node request.
