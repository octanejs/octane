---
'@octanejs/app-core': minor
'@octanejs/vite-plugin': minor
'@octanejs/rsbuild-plugin': minor
---

Route seeds and a config `data` module. `routeSeed(context, name, produce)` hands the browser text once a page has finished rendering, streamed boundaries included, as a JSON script before `</body>`; `readRouteSeed(name)` from `/seeds` reads it there. Naming a module as `data` in `octane.config.ts` opens its default export's store once per request on the server, renders every route inside it, seeds its `dehydrate()` output into the page, retires it when the response ends, and opens the browser's store from that seed, so hydration loads nothing. Both the Vite and Rsbuild integrations support it, in development and production.
