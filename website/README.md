# Octane website

The official Octane site — an octane app built on `@octanejs/vite-plugin`
(SSR + routing + hydration), `@octanejs/router` (in-app routing), and
`@octanejs/mdx` (the docs content, Shiki-highlighted at build time).

## Develop

```bash
pnpm --filter website dev        # streaming dev SSR on http://localhost:5179
pnpm --filter website test       # route smoke tests + built-handler smoke test
```

## Build & preview

```bash
pnpm --filter website build      # → dist/client (static assets) + dist/server (SSR bundle)
pnpm --filter website preview    # octane-preview: serves the PRODUCTION build on :3000
```

`vite build` produces both bundles:

- `dist/client/` — hashed static assets (immutable-cacheable). The built
  `index.html` is **not** here — it is the SSR template and moves to
  `dist/server/` so static hosting can't shadow the SSR handler at `/`.
- `dist/server/entry.js` — the self-contained SSR server (app + octane
  bundled; only node builtins external). Run it directly
  (`node dist/server/entry.js`, honors `PORT`) or import its exports:
  `handler` (`(Request) => Promise<Response>`) and `nodeHandler`
  (`(req, res)` for Node serverless runtimes).

`octane-preview` (the `preview` script) runs exactly that entry — it is the
pre-deploy verification step.

## Deploy (Vercel)

Deployment is handled by `@octanejs/adapter-vercel`: `adapter: vercel()` in
[octane.config.ts](octane.config.ts) makes `vite build` emit Vercel's
[Build Output API](https://vercel.com/docs/build-output-api/v3) under
`.vercel/output/` — hashed assets as static files plus one self-contained Node
function wrapping the SSR handler, with routing/headers in its `config.json`
(filesystem first, then every page — including the `/*splat` 404 catch-all —
server-rendered with a real status code). Vercel picks up `.vercel/output`
automatically after the build command; [vercel.json](vercel.json) only sets
`buildCommand`.

The adapter doesn't affect local workflows: `octane-preview` still serves
`dist/server` directly.

Project settings in the Vercel dashboard:

| Setting          | Value                                        |
| ---------------- | -------------------------------------------- |
| Root Directory   | `website` (enable "Include files outside the Root Directory" — workspace deps) |
| Framework Preset | Other (vercel.json supplies the build command) |
| Install Command  | default (`pnpm install` at the repo root)    |
| Node.js Version  | 20.x or later                                |

No environment variables are required.
