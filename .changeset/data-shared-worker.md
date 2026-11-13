---
'octane': minor
'@octanejs/rspack-plugin': minor
---

Share one octane/data owner between tabs through a SharedWorker. `serveDataOwner` serves an owner from the app's data worker module, and `sharedOwner(name)` connects a tab to it, or returns `null` where SharedWorker is unavailable so the tab opens its own store. The Vite and Rspack plugins' new `dataWorker` option emits that module at `/_octane/data-worker.js`, a path that never changes between deploys, and the Vite dev server serves it there.
