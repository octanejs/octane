# Product examples roadmap

Octane's examples are both usable applications and executable, consumer-level
regression fixtures. Each application owns a small set of framework claims that
are difficult to prove through unit or final-HTML differential tests alone:
focus and selection, live form and media state, scroll position, portal events,
SSR adoption, and behavior while asynchronous work overlaps.

The examples remain in this monorepo while Octane is alpha so an application
failure, its minimized package regression, and the fix can land atomically. A
packed-package validation mode can be added later to catch issues hidden by
workspace linking without splitting the source of truth across repositories.

## Delivery waves

Wave 0 establishes the shared contract and brings the existing applications
under required validation:

- a machine-readable manifest and generated catalog;
- common `typecheck`, `build`, and `test:e2e` package commands;
- reusable Playwright process, port, and page-error utilities;
- deterministic local data for every committed browser test;
- required production-build and browser CI coverage;
- strict typechecking and maintained documentation for every example.

The following waves add product-shaped vertical slices. Product names are
original; the familiar applications describe interaction depth, not branding
or assets to copy.

| Wave | Example | Product shape | Primary evidence target |
| --- | --- | --- | --- |
| 1 | Cinebase | Film and television catalog | Apollo cache isolation, streaming SSR, hydration |
| 1 | Threadline | Social timeline | Optimistic updates, keyed prepends, external stores |
| 1 | Flowboard | Issue and project board | Drag and drop, survivor identity, refs and portals |
| 2 | Streambox | Video platform | Native media events, persistent DOM, virtual comments |
| 2 | Relay | Team chat | Realtime subscriptions, anchored history, reconnect |
| 2 | Cartlane | Commerce and checkout | Native forms, server functions, pending actions |
| 3 | Pagecraft | Document workspace | Contenteditable selection, Lexical, autosave |
| 3 | Gridlab | Spreadsheet | Two-axis virtualization, focus, clipboard and IME |
| 3 | Draftboard | SVG whiteboard | Pointer capture, high-frequency updates, imperative refs |
| 4 | Pulseboard | Analytics console | SVG charts, measurement, tables and virtual logs |
| 4 | Mailroom | Email client | Router fetchers, blockers, drafts and offline outbox |
| 4 | Wayfinder | Travel planner | Parallel `use()`, out-of-order streaming, abort and CSP |

Waves 0–2 are implemented as release-gated fixtures. Waves 3–4 remain planned
work; their product names and evidence targets reserve distinct regression
responsibilities rather than prescribing a specific visual design.

Hacker News remains the dedicated `.tsx` and `.tsrx` parity application.
Duplicating every new application in both dialects would double maintenance
without giving each example a distinct regression responsibility.

## Product-application graduation contract

Wave 0 records the evidence the two existing examples provide today. The
product-shaped applications in Waves 1–4 should not graduate from experimental
to active until they provide:

- several connected, deep-linkable user journeys rather than a showcase page;
- deterministic seeded data and no live network dependency in CI;
- meaningful loading, empty, failure, retry, and offline or disconnect states;
- keyboard-complete critical journeys and a responsive layout;
- strict typechecking for TypeScript/TSX support code and a production compiler
  build for every `.tsrx` component;
- three to five Playwright golden journeys plus at least one rapid-interleaving
  or failure-recovery scenario;
- SSR and hydration evidence when server rendered, including real server
  content, DOM adoption, preserved user state, and working post-hydration events;
- a README and `example.json` that state the supported journeys, bindings,
  rendering modes, and observable Octane claims.

Tests assert public behavior: rendered results, focus, selection, scroll,
form/media state, events, refs, errors, and accessibility. They do not pin
private helpers, compiler temporaries, hydration marker spelling, or internal
scheduling. Performance claims belong in the benchmark harness.

## Bug capture

When a product journey exposes a framework bug:

1. retain the failing application journey as system-level evidence;
2. check the documented intentional divergences before classifying React parity;
3. reduce the failure to the smallest realistic behavioral test in the owning
   runtime, compiler, integration, or binding package;
4. fix the owning package instead of adding an application compatibility shim;
5. keep both layers when they protect different observation boundaries.

The application history, acceptance journeys, deterministic seeds, and focused
fix commits can later form public training material. Held-out evaluation tasks
and gold artifacts must remain outside the public repository.
