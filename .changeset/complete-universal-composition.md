---
'octane': patch
'@octanejs/app-core': patch
'@octanejs/vite-plugin': patch
'@octanejs/rspack-plugin': patch
'@octanejs/rsbuild-plugin': patch
---

Complete the experimental universal client renderer's core composition
semantics: nested component owners, template directives and spreads,
transactional renderer events, and statically declared renderer-owned child
regions in both DOM-to-universal and universal-to-DOM directions. Normalize
and forward boundary metadata consistently across direct compilation, Vite,
Rspack, and Rsbuild while preserving authored source maps and normal universal
HMR, profiling, and parallel-use planning. Add the experimental boundary
configuration schema and the reverse DOM owner bridge used by compiled child
regions.
