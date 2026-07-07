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

Everything is configured in [vercel.json](vercel.json) + [api/ssr.js](api/ssr.js):

- `api/ssr.js` is a Vercel Node function that re-exports `nodeHandler` from
  `dist/server/entry.js` (built before functions are bundled;
  `includeFiles: "dist/server/**"` ships the bundle + its HTML template).
- `outputDirectory: dist/client` serves the hashed assets statically;
  rewrites send all remaining traffic (Vercel checks the filesystem first) to
  `/api/ssr`, so every page — including the `/*splat` 404 catch-all — is
  server-rendered with a real status code.

Project settings in the Vercel dashboard:

| Setting          | Value                                        |
| ---------------- | -------------------------------------------- |
| Root Directory   | `website` (enable "Include files outside the Root Directory" — workspace deps) |
| Framework Preset | Other (vercel.json supplies build + output)  |
| Install Command  | default (`pnpm install` at the repo root)    |
| Node.js Version  | 20.x or later                                |

No environment variables are required.
