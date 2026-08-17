---
'@octanejs/rspack-plugin': patch
'@octanejs/rsbuild-plugin': patch
---

Compile Octane modules in parallel Rspack loader workers by default while
preserving compiler source maps, module layers, build metadata, diagnostics,
and watched package manifests. Both integrations accept `parallel: false` to
disable worker compilation or `parallel: { maxWorkers }` to configure the
worker-pool limit.
