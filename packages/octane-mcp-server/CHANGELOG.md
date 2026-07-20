# @octanejs/mcp-server

## 0.2.6

### Patch Changes

- 2f2a204: Expose the Lynx list-allocation suite through the benchmark tool's validated
  suite list.
- a88f9ea: Add a Cloudflare Workers adapter for full-stack Octane apps. Vite and Rsbuild
  can now emit a Worker-targeted server bundle and a streaming module Worker for
  Workers Static Assets, with Cloudflare bindings and execution context available
  through request-scoped middleware and server-route context.

  Initialize streaming SSR token entropy on the first render so module evaluation
  remains valid in runtimes that prohibit random generation in global scope.

## 0.2.5

### Patch Changes

- 07511e4: Keep `onChange` native while adding compile-time and development-runtime text-host
  diagnostics, explicit commit intent, and correct controlled checkbox/radio
  restoration through native change. Use native `input` events for Base UI text
  controls while preserving the number field's form-facing native change commit,
  propagate authored-source diagnostics through MDX compilation and Vite, and make
  Octane's bridge tooling target React-style text-host event wiring without rewriting
  component callbacks or non-text controls.
- 693bc7b: Add always-on engineering guidance, a production-grade Octane software skill, and
  structured performance and self-review gates for coding agents.

## 0.2.4

### Patch Changes

- c4df384: Refresh the MCP server's repository knowledge to current main: `octane_benchmark` drives the unified runner (`node benchmarks/bench.mjs`) with the full 22-suite manifest, including the React-hosted island and Three renderer/size suites, and a `quick` smoke-pass option; path triage and validation planning cover the Vercel deploy adapter, the evals package, the metaframework plugins, and the website with their vitest projects; the React-API compatibility map corrects stale entries (`lazy` and `useDebugValue` exist, `renderToStaticMarkup` and the streaming `renderToPipeableStream`/`renderToReadableStream` ship under `octane/server`); and the bundled skills reflect controlled inputs matching React, compiler-inferred dependency arrays, the hooks-in-loops compile error, streaming SSR, the production SSR build (`octane-preview`, `@octanejs/adapter-vercel`), and the full bindings table.
- 01a20fb: Add a `./bridge` subpath export and `bridgeReportFromSource(source, { packageName })`, a filesystem-free variant of `bridgeReport` for hosted consumers that scan pasted source instead of an installed package.

## 0.2.3

### Patch Changes

- 15bad71: Add the Apollo Client 4.2.6 binding for Octane, including the complete client
  hook and query-reference surface, Suspense integration, public declarations,
  testing exports, and an Octane `MockedProvider`. Register Apollo in the MCP
  compatibility catalog.
- b41a91a: Add a bundler-neutral Octane compiler and app core, a low-level Rspack 2
  compiler integration, and a full Rsbuild 2 metaframework plugin with routing,
  streaming SSR, hydration, HMR, production client/server builds, preview, and
  adapter support. Keep the existing Vite integration on the same shared core.
- 95872c1: Add the `@octanejs/i18next` binding, porting react-i18next 17.0.9 hooks,
  providers, rich translations, ICU declarations, HOCs, Suspense namespace
  loading, and SSR integration onto Octane while reusing i18next unchanged.

  Teach the MCP binding registry to route react-i18next users to the maintained
  Octane package.

- 2c90d45: Add Redux Toolkit and RTK Query bindings for Octane, including generated query,
  mutation, infinite-query, prefetch, ApiProvider, and dynamic-middleware hooks.
  Register the binding in the MCP compatibility catalog and binding documentation.
- f96a1f9: Add the `@octanejs/sonner` port of Sonner 2.0.7, including the complete toast
  API, Toaster UI and styles, promise and custom toasts, targeted toaster support,
  SSR/hydration support, and differential parity coverage against real Sonner on
  React. Register the new binding with the MCP package bridge.
- d173805: Keep MCP package routing and hook guidance synchronized with the complete
  workspace binding inventory and the public state-hook tuple, and declare the
  Node 22 minimum runtime.

## 0.2.2

### Patch Changes

- 4c7a5ed: `octane_bindings` / `KNOWN_BINDINGS` now covers all fourteen published
  `@octanejs/*` bindings (adds hook-form, base-ui, recharts, redux,
  testing-library, mdx), and the test suite derives the expected set from the
  workspace manifests so the map can no longer drift silently.

## 0.2.1

### Patch Changes

- 3431ec3: Rework the MCP server around Octane users, not just repo maintainers. Skills now ship
  inside the npm package (previously they were read from `.ai/`, which only exists in the
  monorepo checkout, so a globally installed server was broken): `bridge-react-package`,
  `migrate-react-component`, `react-divergences`, and `setup-ssr`. New tools:
  `octane_bridge_react_package` statically scans any React package (or source directory)
  for React API usage and returns an Octane compatibility report with a verdict and a
  step-by-step bridge plan; `octane_bindings` lists the official `@octanejs/*` ports.
  Maintainer tools (project map, triage, validation plan, benchmarks, issue context) now
  register only when the server detects an octane monorepo checkout. Path triage and the
  docs learn about the `radix` binding and the MCP server package itself.
