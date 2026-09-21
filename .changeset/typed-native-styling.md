---
'octane': minor
'@octanejs/cli': minor
'@octanejs/vite-plugin': minor
---

Add typed native styling: a `defineThemeTokens` token contract (`octane/theme-tokens`) checked by TypeScript, plus compile-path diagnostics on scoped `<style>` blocks — `octane-css-unknown-property`, `octane-css-shorthand-longhand-clash`, `octane-css-unused-selector` (warning), `octane-style-unknown-class-key`, `octane-style-token-undeclared`, and `octane-style-token-contract-unresolved` (warning), suppressible via `/* octane-ignore [codes] */`.

`octane analyze` and MCP `octane_compile` now propagate real diagnostic codes (previously flattened to `OCTANE_COMPILE_ERROR`), and both construct a synchronous token-contract resolver; the Vite plugin resolves contract modules through the module graph. `octane_compile` accepts an optional `projectRoot` for contract resolution. Diagnostics never alter emitted code.
