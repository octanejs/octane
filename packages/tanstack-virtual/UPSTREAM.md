# Upstream

- Repository: https://github.com/TanStack/virtual
- Release tag: `@tanstack/react-virtual@3.14.5`
- Commit: `151e9f47abd4ef2d3b11936c04be8908e6bd0607`
- Package: `@tanstack/react-virtual@3.14.5`
- Source root: `packages/react-virtual/src`
- Test root: `packages/react-virtual/tests` and `packages/react-virtual/e2e`
- License: MIT
- npm tarball SHA-256: `e93b937aa9cdc910ab9dddae1c342acee8c2d45b5574298383e204b5a94b718e`

The tagged repository contains a jsdom Vitest suite under
`packages/react-virtual/tests` and Playwright browser suites under
`packages/react-virtual/e2e`. The published npm artifact omits those suites;
npm-tarball omission is not evidence that the canonical tagged suite is absent.
This binding therefore records `upstreamSuites.runtime` as `present` and
`upstreamSuites.types` as `absent` (the pin has `test:types: tsc` package
typecheck only — no dedicated type-test harness). Provenance stays
`recorded-unverified` until pristine upstream and one-for-one adapted
full-suite lanes can execute under `verified` provenance.

Until then, the required differential lane executes four same-fixture
React/Octane scenarios under `react-parity:check`. Ordinary CI keeps
Octane-only nested-flush, SSR, and harness-setup contracts. Real-layout
browser coverage remains an explicit gap pending adapted e2e ownership.

## Upstream test-suite disposition

Every artifact under `packages/react-virtual/tests` and
`packages/react-virtual/e2e` at the pin.

### Runtime (jsdom)

| Upstream artifact | Disposition |
| --- | --- |
| `tests/index.test.tsx` | Present at the pin; not yet executed under pristine/adapted lanes. Cases: `should render`, `should render with overscan`, `should render given dynamic size`, `should use rangeExtractor`, `should handle count change`, `should handle handle height change`. Partial same-scenario coverage today is the repo-authored differential lane (`tests/differential/parity.test.ts`), not a one-for-one adaptation of this file. |
| `tests/test-setup.ts` | Present at the pin; Vitest/`@testing-library` + `ResizeObserver` setup for the jsdom suite. Not adapted; Octane differential uses `tests/_setup.ts` instead. |

### Runtime (Playwright e2e)

| Upstream artifact | Disposition |
| --- | --- |
| `e2e/app/test/cached-measurements.spec.ts` | Present; deferred — needs real-layout browser ownership. Case: `preserves item sizes when list is hidden with useCachedMeasurements`. |
| `e2e/app/test/chat.spec.ts` | Present; deferred. Cases: chat-mode history prepend/append/follow/stream pin behavior (4). |
| `e2e/app/test/direct-dom-updates.spec.ts` | Present; deferred. Cases: container sizing, scroll without per-pixel re-renders, large-scroll re-render, missing `containerRef` (4). |
| `e2e/app/test/measure-element.spec.ts` | Present; deferred. Case: expand → collapse → delete → expand positioning. |
| `e2e/app/test/react-compiler.spec.ts` | Present; deferred. Cases: initial render, scroll update, incremental scroll (3). |
| `e2e/app/test/scroll-anchor.spec.ts` | Present; deferred. Case: anchored item stability into unmeasured items. |
| `e2e/app/test/scroll.spec.ts` | Present; deferred. Cases: scroll to index/last/0 and `initialOffset` (4). |
| `e2e/app/test/smooth-scroll.spec.ts` | Present; deferred. Cases: smooth scroll targets, alignments, sequential, interrupt (7). |
| `e2e/app/test/stale-index.spec.ts` | Present; deferred. Case: no stale `getItemKey` after removals. |
| `e2e/app/**` (fixtures, Vite/Playwright config, HTML shells) | Present; support for the deferred e2e suite — not adapted. |

### Types

No `__typetest__` / `*.test-d.ts` harness ships under `packages/react-virtual` at
the pin. `test:types` runs `tsc` over the package itself. Octane package
declaration probes live in `typetests/public-api.test-d.ts` and are not parity
type evidence.
