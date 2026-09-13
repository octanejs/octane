---
'octane': patch
'@octanejs/grab': patch
---

Keep `createRoot({ inspect: false })` overlay roots scheduling while `pauseUpdates()` freezes the app, and defer grab's local `createEffect` until after `createRoot` setup so activation no longer hits a TDZ crash.
