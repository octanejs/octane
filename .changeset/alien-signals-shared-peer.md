---
'@octanejs/alien-signals': patch
---

`alien-signals` is now a peer dependency (`^3.2.1`), as it is for `react-alien-signals`, so the binding uses the application's copy and signals created on either side share one reactive graph. Install `alien-signals` next to `@octanejs/alien-signals` if your app does not already have it.
