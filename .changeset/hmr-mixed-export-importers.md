---
'octane': patch
---

Fix hot updates leaving importers with stale values when a module exports a value beside a component. Under Vite, the module now invalidates when such an export changes, so the update propagates to its importers. Under webpack and Rspack, the module no longer accepts its own updates, so its importers re-execute. Editing only a component still refreshes it in place.
