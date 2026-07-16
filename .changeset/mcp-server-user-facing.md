---
"@octanejs/mcp-server": patch
---

Rework the MCP server around Octane users, not just repo maintainers. Skills now ship
inside the npm package (previously they were read from `.ai/`, which only exists in the
monorepo checkout, so a globally installed server was broken): `bridge-react-package`,
`migrate-react-component`, `react-divergences`, and `setup-ssr`. New tools:
`octane_bridge_react_package` statically scans any React package (or source directory)
for React API usage and returns an Octane compatibility report with a verdict and a
step-by-step bridge plan; `octane_bindings` lists the official `@octanejs/*` ports.
Maintainer tools (project map, triage, validation plan, benchmarks, issue context) now
register only when the server detects an octane monorepo checkout. Path triage and the
docs learn about the `radix` binding and the MCP server package itself.
