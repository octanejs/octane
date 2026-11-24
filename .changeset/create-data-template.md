---
'@octanejs/cli': minor
'create-octane': patch
---

`octane create --template data` (and `npm create octane -- --template data`, or `octane init --mode data`) scaffolds the `fullstack` app with `octane/data`: a reading list at `/books` that loads and adds books through a data worker. It writes the contracts (`src/books.data.ts`), their handler (`src/server/data.ts`), the module server function the store calls (`src/data.tsrx`), the data client the build makes the data worker from (`src/data.client.ts`, with `dataClient` in `vite.config.ts`), and the config's `data` module (`src/store.ts`), and installs `zod`. The server renders the list in a store per request and seeds the page with it; the browser's store, opened with `openDataStore` over the data worker, starts from that seed, so hydration loads nothing. Adding a book is a native form (`form` fields on `addBook`, and the handler's `forms` middleware before `/books`), so it works before the page hydrates and without JavaScript; set `FORMS_SECRET` to sign its tokens across server processes.
