# Octane examples

These applications are both runnable demonstrations and release-gated browser
fixtures. They exercise Octane through complete user journeys and retain
consumer-visible regressions that are too broad for an isolated unit test.

The machine-readable [`catalog.json`](catalog.json) is generated from each
application's `example.json`. It records rendering modes, dialects, bindings,
framework features, commands, browser journeys, and deterministic fault
scenarios. See the [product examples roadmap](../docs/examples-roadmap.md) for
the planned application waves.

## Current applications

| Application | Purpose | Validation |
| --- | --- | --- |
| [Hacker News](hacker-news) | The same routed reader in React-style TSX and TSRX, with Suspense, StyleX, deterministic data, SSR, and hydration | Strict TypeScript support code, both production client builds, shared Playwright journeys across both dialects |
| [Lexical Playground](lexical-playground) | A real rich-text editor using the Octane Lexical binding, including history, formatting, decorator portals, and a slash picker | Strict TypeScript support code, production TSRX build, production-preview Playwright journeys |

## Repository commands

```bash
pnpm examples:catalog        # regenerate examples/catalog.json
pnpm examples:catalog:check  # validate manifests and catalog freshness
pnpm examples:catalog:test   # exercise invalid manifest contracts
pnpm examples:typecheck      # run every example's strict TypeScript gate
pnpm examples:shared:test    # exercise shared process lifecycle helpers
pnpm examples:build          # build every example for production
pnpm examples:e2e            # run every Playwright journey, serially by app
pnpm examples:check          # catalog + types + helper tests + production builds
```

The browser-launch scripts currently target a POSIX shell, matching the Ubuntu
CI gate and local macOS/Linux workflows. The ordinary application `dev`,
`typecheck`, and `build` commands do not depend on those launch scripts.

Browser journeys run in their own CI job rather than inside the sharded Vitest
command. This prevents each Playwright suite from running once per Vitest shard;
the existing protected `typecheck` context aggregates the job result so the
examples remain a merge gate.

## Adding an application

An application under `examples/<id>` must be a private workspace package and
provide the standard `typecheck`, `build`, and `test:e2e` scripts. Add an
`example.json` matching [`example.schema.json`](example.schema.json), regenerate
the catalog, and keep every referenced journey executable.

Use the helpers in [`_shared/e2e`](_shared/e2e) for dynamic server addresses,
safe child-process cleanup, and browser console/page-error diagnostics. CI data
must be local and deterministic; an optional live-data demo mode may exist, but
committed tests cannot depend on it.

Playwright assertions should stay at the consumer observation boundary:
rendered content, navigation, focus, selection, scroll, live form or media
state, events, refs, errors, and accessibility. Do not assert compiler helper
names, hydration marker spelling, or other private implementation details.

When an example uncovers an Octane or binding bug, retain the meaningful app
journey and add the smallest realistic behavioral regression to the owning
package. Fix the owning package rather than hiding the failure behind an
example-only workaround.
