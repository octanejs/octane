---
'@octanejs/app-core': patch
'@octanejs/vite-plugin': patch
'@octanejs/rsbuild-plugin': patch
---

Honour `server.trustProxy` in the request URL. Behind a proxy that terminates
TLS or rewrites `Host`, the Node bridge built every URL from `http://` and the
`Host` header, so `Context.url` named a different origin than the browser's and
same-origin checks rejected legitimate requests. With `server.trustProxy: true`,
`nodeHandler`, the built-in server, `octane-preview`, and the Vite and Rsbuild
dev servers take the scheme from the first `X-Forwarded-Proto` entry (`http` or
`https` only) and the host from the first `X-Forwarded-Host` entry (a plain
`host[:port]` only). A malformed value is ignored, and the path and query always
come from the request. `nodeRequestToWebRequest` and `createNodeServer` accept
the same `trustProxy` option. The default is unchanged.

`server.trustProxy` must now be a boolean, so a string such as `'false'` read
from an environment variable can no longer enable it.
