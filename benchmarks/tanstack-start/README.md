# tanstack-start — the same Start app on Octane and React

One application, built and served twice: `octane/` runs the repo's vendored
`@tanstack/octane-start` (native `StreamOptions.injection` stream path,
nitro `.output` server); `react/` runs `@tanstack/react-start` from npm,
**pinned to the same release family as the vendored packages**
(react-start 1.168.28, react-router 1.170.18), served by a minimal srvx
front (`serve.mjs`). A correctness gate proves the two render and behave as
the same app; the perf suite then quantifies the differences.

## Provenance

Both apps derive from TanStack's own mirrored e2e pair at
TanStack/router@`753f919e` (MIT — see `LICENSE.upstream`):
`e2e/react-start/basic` (near-verbatim, trimmed) and `e2e/octane-start/basic`
(scaffolding), with the octane routes ported 1:1 from the react ones. Route
surface: `/`, `/posts`, `/posts/$postId`, a 404 post, and `/deferred`
(streamed deferred data). Both flavors read one deterministic fixture
(`shared/posts-data.mjs`) — no network, ever; latency knobs via
`BENCH_DATA_DELAY_MS` / `BENCH_DEFER_MS`. Tailwind was replaced by one inert
stylesheet on both sides (styling is not measured; upstream class names stay
in the markup and are compared).

## Running

```bash
pnpm --filter tanstack-start-bench build   # builds both flavors
pnpm --filter tanstack-start-bench compare # structural gate (must pass first)
pnpm --filter tanstack-start-bench test:e2e# behavioral gate, one spec × both
```

- `compare.mjs` fetches every route from both production servers, strips each
  framework's dialect (hydration markers, framework scripts/attributes, head
  ordering, octane's `#__app` container), and requires the remaining element
  tree + text to match node for node. **Currently 5/5 routes PASS.**
- `e2e/bench.spec.ts` runs identical journeys against both servers with a
  clean-console gate. **Currently 7/8 pass.**

## Known issue (tracked, blocks the perf phase)

The `posts` journey's final assertion fails on the octane flavor only: a
client-side child navigation (`/posts` → `/posts/3`) remounts the whole match
tree (parent route state lost; every DOM node replaced) where the react
flavor preserves it. Instrumented cause: `Match`'s `SuspenseWrap` flips
`SafeFragment → Suspense` because `matchState.ssr === false` on
client-loaded matches in the octane flavor — react-router 1.170.18 carries
the identical condition without the flip, so the divergence is in the
flavor-specific inputs that drive the ssr flag. `remount-probe.mjs`
(production, DOM-identity) and `remount-dev-probe.mjs` (dev server + mount
logging) reproduce it. The perf harness (`run.mjs`, bench.mjs registration)
is deliberately absent until this gate is fully green — numbers taken today
would compare a remounting app against a non-remounting one.
