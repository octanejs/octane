---
'@octanejs/cli': minor
'create-octane': patch
---

`octane create --template data` (and `npm create octane -- --template data`, or `octane init --mode data`) scaffolds the `fullstack` app with `octane/data`: a reading list at `/books` that loads and adds books through a data worker. It writes the contracts (`src/books.data.ts`), their handler (`src/server/data.ts`), the module server function the store calls (`src/data.tsrx`), the data client the build makes the data worker from (`src/data.client.ts`, with `dataClient` in `vite.config.ts`), and the store (`src/store.ts`, `openDataStore`), and installs `zod`. The page server-renders its frame and a loading line, then loads the list in the browser.
