---
'octane': patch
'@octanejs/vite-plugin': patch
'@octanejs/rspack-plugin': patch
---

Load the server-call response reader off the critical path. Calls still encode their arguments and send their request at call time; the reader (result streaming, batch decoding and devalue's parser) now preloads once the page has loaded and gone idle, and a call made before then fetches it alongside the server's reply. Server functions that take a `ServerCallContext` compile to a new `__serverRpcStream` target, so an app whose calls all stream no longer ships devalue's encoder. In the signal-chat example this removes about 4.2 KB gzip from the first view.
