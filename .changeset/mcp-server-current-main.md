---
'@octanejs/mcp-server': patch
---

Refresh the MCP server's repository knowledge to current main: `octane_benchmark` drives the unified runner (`node benchmarks/bench.mjs`) with the full 22-suite manifest, including the React-hosted island and Three renderer/size suites, and a `quick` smoke-pass option; path triage and validation planning cover the Vercel deploy adapter, the evals package, the metaframework plugins, and the website with their vitest projects; the React-API compatibility map corrects stale entries (`lazy` and `useDebugValue` exist, `renderToStaticMarkup` and the streaming `renderToPipeableStream`/`renderToReadableStream` ship under `octane/server`); and the bundled skills reflect controlled inputs matching React, compiler-inferred dependency arrays, the hooks-in-loops compile error, streaming SSR, the production SSR build (`octane-preview`, `@octanejs/adapter-vercel`), and the full bindings table.
