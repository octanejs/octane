---
'@octanejs/app-core': minor
---

Add `@octanejs/app-core/server-functions`. `createServerFunctions({ modules, middlewares })` serves `module server` functions from a Node server an Octane integration does not own, under any bundler that compiles `.tsrx` for the server. `handle(request)` answers a browser's call with the same origin checks, body limit and middleware as an Octane app server. `respond(request, render)` runs any other request through the middleware, so the server functions a page render calls run in process under that request's viewer.
