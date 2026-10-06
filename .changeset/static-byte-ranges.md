---
'@octanejs/app-core': patch
---

Serve byte ranges from the built-in static file server. Safari will not play a
`<video>` or `<audio>` from a server that ignores `Range`, so media served by
`createNodeServer` (the default production boot and `octane-preview`) did not
play there. A `GET` for one `bytes=` range (`first-last`, `first-` or the suffix
`-length`) now gets `206 Partial Content` with `Content-Range`, and a range that
starts past the end of the file gets `416` with `Content-Range: bytes */<size>`.
A ranged response is never gzip-compressed, and uncompressed static responses
send `Accept-Ranges: bytes`. Several ranges, another unit, an invalid range,
`If-Range` (static files send no validator to match), `HEAD`, and an empty file
still get the whole file.
