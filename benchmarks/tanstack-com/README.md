# tanstack-com — the real tanstack.com on Octane, React, and Redact

One application — TanStack's production website — built and served three ways
on identical app code and pinned content:

- `react/` + `BENCH_DIST=dist` — **stock React** (the fairness baseline; the
  redact alias map is OFF, which upstream exposes as `DISABLE_REDACT`).
- `react/` + `BENCH_DIST=dist-redact` — **`@tanstack/redact`**, Tanner's
  React-compatible engine, aliased over react/react-dom exactly as the
  production deployment runs it (built with `BENCH_REDACT=true`).
- `octane/` — the shell ported to Octane on `@octanejs/tanstack-start`
  (Phase 2c, in progress).

## Provenance and permission

The app derives from [TanStack/tanstack.com](https://github.com/TanStack/tanstack.com)
at commit `3b4add9c` (2026-07-19). That repository carries **no license**;
this port exists with Tanner Linsley's permission (confirmed 2026-07-20) and
is used solely as a benchmark fixture inside this repository — do not
re-publish or redistribute it. Docs content is a pinned snapshot of
[TanStack/router](https://github.com/TanStack/router) `docs/` at `edf55759`
(MIT), vendored under `content/repos/router/`.

Version pins are family-matched to the octane side (react-start 1.168.26,
react-router 1.170.16 vs our vendored 1.168.28/1.170.18).

## Bench deltas from upstream

Every functional change is confined to external-service seams; each rewritten
file preserves the upstream original beside it as `*.upstream.*.txt`. The
formatting of the vendored tree was normalized by the repo's Prettier config
(diff against upstream with prettier-normalization).

| Area | Delta |
| --- | --- |
| Route surface | 160 → 29 route files: `/`, blog (12 newest posts), `/libraries`, router landing, docs chain, static pages, txt/xml endpoints. Admin/account/auth/oauth/shop/stats/builder/intent/showcase/api removed. |
| Deploy stack | Cloudflare Workers plugin, Sentry, Google Analytics, devtools, bundle analyzer, Takumi OG images removed. Node loopback servers (`serve.mjs`, srvx) replace the Worker runtime. |
| Server entry | `src/server.ts` keeps security headers + docs markdown content negotiation; drops Sentry/diagnostics/db-context/GA-proxy/cron. |
| Auth / users / doc feedback | Server fns answer as upstream answers an **anonymous visitor** (no user, empty feedback, writes fail unauthenticated) — upstream serves these states without touching the database. |
| Shop | Storefront fns answer as an empty shop / no cart (upstream's cookie-less state). Navbar cart button renders; shop routes are removed. |
| Sponsors | Fixed synthetic roster (63 sponsors, tiered amounts, inline-SVG avatars) replacing the GitHub GraphQL sponsorships API. |
| npm/GitHub stats | Fixed figures; homepage summary is `null` (a legitimate upstream cache-miss state that renders the designed static fallbacks). |
| Docs content | `TANSTACK_DOCS_LOCAL=true` forces upstream's local-files docs mode in production; content read from the pinned snapshot. Negative control: a broken snapshot dir 404s (no GitHub fallback). |
| Partner rotation | `BENCH_PARTNER_SEED` pins the per-session rotation seed. |
| Search | `SearchModal` (Algolia + Kapa AI, 3.7k lines) replaced by an inert dialog with the same lazy seam and exports. |
| Server bundling | `ssr.noExternal: true` for ALL flavors — matches the upstream Workers build and is load-bearing for redact under node: any externalized react-consumer loads stock React beside redact's renderer and crashes with a null dispatcher. |

## Building and running

```bash
pnpm --filter tanstack-com-bench-react build                    # → dist/
BENCH_REDACT=true pnpm --filter tanstack-com-bench-react build  # → rename to dist-redact/

NODE_ENV=production PORT=4200 BENCH_PARTNER_SEED=bench \
TANSTACK_DOCS_LOCAL=true TANSTACK_LOCAL_REPOS_DIR=$PWD/content/repos \
  node react/serve.mjs                       # react flavor
BENCH_DIST=dist-redact ... node react/serve.mjs  # redact flavor
```

All benchmark routes are fully offline-deterministic (no network, no
secrets); server logs must stay free of `fetchFs` warnings.

## Octane-issue policy

If the octane port exposes a bug in Octane (runtime, compiler, SSR,
bindings), the fix lands in `packages/octane` / the relevant `@octanejs/*`
package in this branch — red/green-tested — and the port consumes it.
Workarounds inside `octane/` are not acceptable; the bench deltas above are
the only sanctioned divergences, and they apply identically to every flavor.
