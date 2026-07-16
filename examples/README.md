# Octane examples

These applications are both runnable demonstrations and release-gated browser
fixtures. They exercise Octane through complete user journeys and retain
consumer-visible regressions that are too broad for an isolated unit test.

The machine-readable [`catalog.json`](catalog.json) is generated from each
application's `example.json`. It records rendering modes, dialects, bindings,
framework features, commands, browser journeys, and deterministic fault
scenarios. See the [product examples roadmap](../docs/examples-roadmap.md) for
the delivery waves and the distinct regression responsibility of each app.

## Current applications

| Application | Purpose | Validation |
| --- | --- | --- |
| [Cartlane](cartlane) | A commerce checkout using native form actions, server functions, pending state, streaming SSR, and hydration | Strict TypeScript support code, production client and server builds, and validation, idempotency, offline recovery, and hydration Playwright journeys |
| [Cinebase](cinebase) | A film and television catalog using Apollo Client, request-scoped data, streaming SSR, and hydration | Strict TypeScript support code, production TSRX client build, deterministic server fixtures, and SSR/hydration Playwright journeys |
| [Draftboard](draftboard) | An SVG whiteboard using native pointer capture, high-frequency updates, and imperative refs | Strict TypeScript support code, production TSRX build, and pointer, keyboard, identity, and recovery Playwright journeys |
| [Flowboard](flowboard) | An issue and project board using dnd-kit, refs, keyed identity, and portaled interaction surfaces | Strict TypeScript support code, production TSRX build, and pointer, keyboard, identity, and recovery Playwright journeys |
| [Gridlab](gridlab) | A virtualized spreadsheet using independent row and column virtualizers, native clipboard events, and composition-safe editing | Strict TypeScript support code, production TSRX build, and virtualization, focus, clipboard, IME, and recovery Playwright journeys |
| [Hacker News](hacker-news) | The same routed reader in React-style TSX and TSRX, with Suspense, StyleX, deterministic data, SSR, and hydration | Strict TypeScript support code, both production client builds, shared Playwright journeys across both dialects |
| [Lexical Playground](lexical-playground) | A real rich-text editor using the Octane Lexical binding, including history, formatting, decorator portals, and a slash picker | Strict TypeScript support code, production TSRX build, production-preview Playwright journeys |
| [Mailroom](mailroom) | An email client using Remix Router fetchers and navigation blockers, durable drafts, and an offline outbox | Strict TypeScript support code, production TSRX build, and deep-link, draft, blocker, outbox, and recovery Playwright journeys |
| [Pagecraft](pagecraft) | A document workspace using Lexical, contenteditable selection, deep links, and overlapping autosaves | Strict TypeScript support code, production TSRX build, and selection, formatting, navigation, autosave, and recovery Playwright journeys |
| [Pulseboard](pulseboard) | An analytics console using Visx, TanStack Table, live measurement, and virtualized operational logs | Strict TypeScript support code, production TSRX build, and chart, measurement, table, virtualization, and recovery Playwright journeys |
| [Relay](relay) | A team workspace using a real SSE boundary, optimistic messages, reconnect replay, anchored history, and portaled threads | Strict TypeScript support code, production TSRX build, deterministic event service, and realtime, identity, keyboard, and recovery Playwright journeys |
| [Streambox](streambox) | A video platform using native media events, a persistent player node, and TanStack Virtual comments | Strict TypeScript support code, production TSRX build, local seekable media, and playback, identity, virtualization, navigation, and recovery Playwright journeys |
| [Threadline](threadline) | A social timeline using Zustand, optimistic mutations, keyed prepends, and live composer state | Strict TypeScript support code, production TSRX build, and navigation, identity, rapid-interleaving, and rollback Playwright journeys |
| [Wayfinder](wayfinder) | A streaming travel planner using parallel `use()`, out-of-order Suspense reveals, request aborts, and CSP-safe hydration | Strict TypeScript support code, production client/server builds, and SSR adoption, streaming, abort, CSP, and recovery Playwright journeys |

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
