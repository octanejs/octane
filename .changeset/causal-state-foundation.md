---
'octane': patch
'@octanejs/app-core': patch
'@octanejs/vite-plugin': patch
'@octanejs/rspack-plugin': patch
'@octanejs/rsbuild-plugin': patch
'@octanejs/mdx': patch
---

Add the causal state-model foundation: package-scoped policy configuration,
compiler diagnostics and component/cell provenance, runtime render and cell-owned
purity guards across DOM, SSR, hydration, and universal renderers, plus consistent
Vite, Rspack, Rsbuild, MDX, and editor integration. The rollout default remains
`permissive`; effect setup and cleanup findings are report-only until replacement
primitives and callback provenance land.
