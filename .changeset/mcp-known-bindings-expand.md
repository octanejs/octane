---
'@octanejs/mcp-server': patch
---

`octane_bindings` / `KNOWN_BINDINGS` now covers all fourteen published
`@octanejs/*` bindings (adds hook-form, base-ui, recharts, redux,
testing-library, mdx), and the test suite derives the expected set from the
workspace manifests so the map can no longer drift silently.
