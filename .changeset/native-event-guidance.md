---
'@octanejs/base-ui': patch
'@octanejs/mdx': patch
'@octanejs/mcp-server': patch
'octane': patch
---

Keep `onChange` native while adding compile-time and development-runtime text-host
diagnostics, explicit commit intent, and correct controlled checkbox/radio
restoration through native change. Use native `input` events for Base UI text
controls while preserving the number field's form-facing native change commit,
propagate authored-source diagnostics through MDX compilation and Vite, and make
Octane's bridge tooling target React-style text-host event wiring without rewriting
component callbacks or non-text controls.
