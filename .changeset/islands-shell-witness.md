---
'octane': minor
'@octanejs/vite-plugin': minor
---

Development server renders now report the client work an islands-only shell actually renders. The Vite dev server renders a `hydrate: 'islands'` route with the new `shellWitness` render option and warns once per site when the shell, outside its independent `<Hydrate>` islands, renders an event handler or function form action, a ref, an effect or store-subscription hook, a controlled `value` or `checked` the user can edit, or a live signal-handle binding. None of these would run, because the shell's modules never load in the browser.

The report follows the render rather than the source, so it also catches what the build's source check cannot follow: components passed by reference, local aliases, handlers and refs passed through spreads, and elements a plain helper creates with `createElement`. It covers only the branches, rows, and streamed boundaries a request reaches. The route keeps serving either way, and the production build check is unchanged.

`renderToString`, `renderToReadableStream`, and the other server renderers accept `shellWitness` in development. Production renders ignore it at no cost, and the production compiler output is unchanged.
