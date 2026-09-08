---
'@octanejs/vite-plugin': patch
---

Ignore virtual module IDs when watching `octane.config.ts` dependencies, so decorator helpers cannot crash the Vite dev server while imported files still trigger reloads.
