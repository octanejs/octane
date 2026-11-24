---
'octane': minor
'@octanejs/vite-plugin': minor
'@octanejs/rspack-plugin': minor
---

Declare an app's data client once and let the build make its data worker. `export default defineDataClient({ transport, listen?, persist? })` from `octane/data`, with `persist` a function of the signed-in account, in one module, and set the new `dataClient` option of `octane()` from `octane/compiler/vite` or `@octanejs/vite-plugin`, or of `OctaneRspackPlugin`, to its path. The plugins generate the data worker from it, emitted and served at `/_octane/data-worker.js` as `dataWorker` is, and `octane/data/client`, whose `openDataStore(account, { seed?, seedAge?, form? })` opens a page's store over that worker with the client's options and the build's contracts. `dataWorker` stays for apps that write their own worker module; the two options are exclusive, and `dataClient` needs the generated manifest, so it refuses `data: false`.
