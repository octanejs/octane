# Octane remote MCP server

The hosted MCP server for Octane (`mcp.octanejs.dev`) — the remote counterpart
to the stdio [`@octanejs/mcp-server`](../packages/octane-mcp-server) package.
It gives any agent Octane superpowers with zero install: docs search and
reading, real-compiler `.tsrx` validation, bindings knowledge, and React
migration scanning, over stateless
[Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http).

It is itself an octane app built on `@octanejs/vite-plugin` — the MCP endpoint
and the REST extras are `ServerRoute`s, the landing page at `/` is one SSR
`RenderRoute` — deployed with `@octanejs/adapter-vercel`.

## Surface

- `POST /v1/mcp` — the MCP endpoint (stateless; buffered JSON responses).
  ```bash
  claude mcp add --transport http octane https://mcp.octanejs.dev/v1/mcp
  ```
  Tools: `octane_docs_search`, `octane_docs_read`, `octane_compile`,
  `octane_bindings`, `octane_bindings_status`, `octane_bridge_scan`,
  `octane_skill`. Resources: `octane://docs/{slug}`, `octane://skills/{name}`,
  `octane://bindings`.
- `GET /v1/docs`, `GET /v1/docs/:slug`, `GET /v1/bindings` — the same
  knowledge as versioned JSON for agents without an MCP client.
- `GET /llms.txt`, `GET /llms-full.txt` — the agent summary, alone and with
  the full docs corpus appended.

`/v1` is the API contract: tool names and response shapes stay stable within
it; a breaking revision mounts as a sibling `/v2` route table. The knowledge
itself always tracks the commit the deployment was built from.

## How the knowledge gets in

Everything the server serves is snapshotted at **build time** via Vite `?raw`
and `import.meta.glob` imports (`src/content/`): the website docs MDX
(`website/src/content/docs/*.mdx` + the `docs-meta.ts` registry), the repo
deep dives (`docs/ssr.md`, `docs/differences-from-react.md`), every binding's
`status.json`, the `@octanejs/mcp-server` skills, and `llms.txt`. The deployed
function does zero filesystem reads; search runs on the same
sectionizer/ranking as the website's search dialog
(`website/src/lib/docs-search-core.ts`). The repo-mode tools of the stdio
server (benchmarks, scaffolding, `gh`) are deliberately not part of the
remote surface.

## Develop

```bash
pnpm --filter website-mcp dev        # dev SSR on http://localhost:5180
pnpm --filter website-mcp test       # content/search/tool tests + built-handler e2e
```

## Build & preview

```bash
pnpm --filter website-mcp build      # → dist/client + dist/server + .vercel/output
pnpm --filter website-mcp preview    # octane-preview: serves the PRODUCTION build on :3000
```

Smoke-test the production build locally:

```bash
curl -X POST http://localhost:3000/v1/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

## Deploy (Vercel)

`adapter: vercel()` in [octane.config.ts](octane.config.ts) makes `vite build`
emit the [Build Output API](https://vercel.com/docs/build-output-api/v3) under
`.vercel/output/`; [vercel.json](vercel.json) only sets `buildCommand`.

Project settings in the Vercel dashboard (domain: `mcp.octanejs.dev`):

| Setting          | Value                                                                       |
| ---------------- | --------------------------------------------------------------------------- |
| Root Directory   | `mcp` (enable "Include files outside the Root Directory" — workspace deps) |
| Framework Preset | Other (vercel.json supplies the build command)                              |
| Install Command  | default (`pnpm install` at the repo root)                                   |
| Node.js Version  | 22.x or 24.x                                                                |

No environment variables are required.
