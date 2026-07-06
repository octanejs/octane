---
'octane': patch
---

compiler: return-JSX functions now contribute real sourcemap segments. `compileReturnJsxFunction` prints via `printNodeWithMap` and threads esrap's per-token mappings into the module map (adjusted for inlined directive helpers and export wrappers), so chained maps over compiled output — e.g. @octanejs/mdx's two-stage `.mdx` map — compose instead of falling back to the intermediate-JSX map.
