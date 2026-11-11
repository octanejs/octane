---
'octane': minor
---

`octane/data` can be served through a `module server` function, so an app needs no data route of its own. `DataServer.serve(request, call)` answers one store request inside a server function, and the new `serverTransport(fn)` sends a store's requests through that function. In the browser that's the compiler's RPC stub, under the app's origin checks, body limits and middleware. During a server render, the same call runs in process under the page's request. Requests and replies keep the store's devalue encoding, so dates, maps and sets survive although a server call carries only plain data, and a failed call leaves a write's outcome unknown, as a lost HTTP reply does. `createDataHandler`'s `context` option now also receives the caller (the viewer middleware authenticated), and `forms(request, caller)` takes the same, so a page's forms are signed for the right account from `before` middleware.
