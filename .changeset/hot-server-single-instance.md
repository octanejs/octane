---
"@octanejs/vite-plugin": patch
---

Dev-server hydrate entry now maps route entries, layouts, preHydrate, and root boundaries as literal dynamic imports (as production already did), so they load through Vite's import analysis and share module-instance identity with the page's own import chain. Previously the analysis-hidden fallback import fetched timestamp-less URLs after an HMR invalidation, creating duplicate browser module instances (e.g. two app-router singletons) that broke hydration on every reload until the dev server restarted.
