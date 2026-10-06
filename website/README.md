# Octane website

The official Octane site — an Octane app built on `@octanejs/tanstack-start` and
`@octanejs/tanstack-router` for file routing, SSR, and hydration. The docs content
still uses `@octanejs/mdx` with Shiki highlighting at build time.

## Develop

```bash
pnpm --filter website dev        # streaming dev SSR on http://localhost:5179
pnpm exec vitest run --project website # route and browser smoke tests
```

## Build & preview

```bash
pnpm --filter website build      # TanStack Start + Nitro production build
pnpm --filter website preview    # serves the production build on :3000
pnpm --filter website start      # runs .output/server/index.mjs directly
```

`vite build` produces Nitro's deployable `.output/` directory:

- `.output/public/` — hashed client assets and public files.
- `.output/server/index.mjs` — the production SSR server. Run it with the
  package's `start` script; it honors Nitro's normal host and port variables.

The `preview` script is the local pre-deploy verification step.

## Deploy (Vercel)

Deployment is handled by Nitro's Vercel preset. Vercel selects that preset from
its build environment and the existing [vercel.json](vercel.json) runs the
website build. TanStack Start owns the request handler, route status codes, and
hydration payload; Nitro packages that handler and the client assets for the
target platform. The generated function stays pinned to Node.js 24, matching
the previous adapter.

Project settings in the Vercel dashboard:

| Setting          | Value                                        |
| ---------------- | -------------------------------------------- |
| Root Directory   | `website` (enable "Include files outside the Root Directory" — workspace deps) |
| Framework Preset | Other (`vercel.json` supplies the build command) |
| Install Command  | default (`pnpm install` at the repo root)    |
| Node.js Version  | 22.x or 24.x                                |

No environment variables are required.

## Deploy (Cloudflare Workers)

Nitro's `cloudflare-module` preset builds the site as a Worker with Workers
Static Assets. Cloudflare Workers Builds sets `WORKERS_CI`, which makes Nitro
pick that preset and makes [vite.config.ts](vite.config.ts) drop the Node-only
HTML compression plugin and precompressed asset siblings (Cloudflare compresses
at its edge). The build writes `.output/server/wrangler.json` plus a
`.wrangler/deploy/config.json` redirect, so `wrangler` run from `website/` uses
the generated config. The Worker name and compatibility date are pinned in the
`cloudflare.wrangler` block of the Nitro options.

Workers Builds settings (Worker `octane-website`):

| Setting         | Value                                        |
| --------------- | -------------------------------------------- |
| Root directory  | `/` (pnpm installs the whole workspace)      |
| Build command   | `pnpm --filter website build`                |
| Deploy command  | `cd website && pnpm exec wrangler deploy`        |
| Build variables | `NODE_VERSION=24`                            |

Keep non-production branch builds off until PR previews move off Vercel. Once
on, Workers Builds builds every branch pushed to the repository. Workers Paid is
required, because the free plan's 10 ms CPU limit per request is too low for
SSR. No runtime environment variables are required.

Run the Cloudflare build locally:

```bash
NITRO_PRESET=cloudflare-module pnpm --filter website build
cd website && pnpm exec wrangler dev
```

