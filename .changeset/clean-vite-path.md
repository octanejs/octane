---
'@octanejs/vite-plugin': patch
---

Preserve Vite's standard SPA HTML handling when no `octane.config.ts` exists, so
the same recommended plugin works for client-only SPAs and routed full apps.
