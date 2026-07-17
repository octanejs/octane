---
'@octanejs/three': patch
'@octanejs/rsbuild-plugin': patch
---

Add production-validated client-only Canvas SSR and hydration through Vite and Rsbuild, with the equivalent raw Rspack client/server graph split. Ensure Rsbuild browser environments replace Octane's `process.env.NODE_ENV` runtime guards during programmatic production builds.
