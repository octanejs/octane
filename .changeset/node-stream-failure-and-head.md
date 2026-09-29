---
'@octanejs/app-core': patch
'@octanejs/vite-plugin': patch
'@octanejs/rsbuild-plugin': patch
---

Abort failed streamed responses and end HEAD responses without draining the body.

When a Web Response body failed after the Node transport had sent headers, the
built-in server appended `Internal Server Error` to the partial body and
completed the response normally. Clients saw a successful HTTP 200 with the
wrong bytes. `sendWebResponse` now destroys the response instead, so the client
sees an interrupted transfer. It then rejects with the body error, which the
caller logs. If the body fails before any byte is sent, the sender removes the
Web Response's headers. The server's 500 response then no longer carries the
failed response's `Content-Encoding` or `Content-Length`, which previously made
it undecodable or truncated. The built-in server, the generated `nodeHandler`,
and the Vite and Rsbuild dev middlewares no longer write to a response whose
headers were already sent. In Vite dev, this also stops a late body failure from
leaving the request open.

HEAD responses now end as soon as the status and headers are sent, and the
unused body is cancelled so its producer is released. Previously the transport
read the whole body, which Node discards for HEAD, before ending the response.
A streaming SSR page or a long-lived stream could therefore hold a HEAD request
open indefinitely.
