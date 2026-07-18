# Octane website

The official Octane site — an Octane app built on TanStack Start and
`@tanstack/octane-router` for file routing, SSR, and hydration. The docs content
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
