# Upstream

- Repository: https://github.com/TanStack/virtual
- Package: `@tanstack/react-virtual@3.14.26`
- Release commit: `11b48e4ab8b08d483c8fe29a31ef11261ffbda04`
- Source root: `packages/react-virtual/src`
- Test roots: `packages/react-virtual/tests` and `packages/react-virtual/e2e`
- License: MIT; exact root license in `LICENSE.upstream`
- npm artifact SHA-256: `1c6d0c9c5ec85d51946e074eff195b4ed81f9764e748498cd6d896bd06ecde77`
- Runtime dependency: `@tanstack/virtual-core@3.19.11`, imported directly

## Source boundary

`audit/upstream.lock.json` pins all 56 files in the upstream package, including
its complete source, unit tests and browser fixtures. The immutable source and
artifact are test inputs and are excluded from publication. The binding adapts
the React hook implementation; `src/internal.ts` supplies native slot handling.
The core's public implementation is consumed from its package.

The adapter grows the direct-DOM container before `_willUpdate` restores an
end-anchored scroll position. Otherwise the browser clamps a prepend's new scroll
offset against the old container height. Both positioning modes have a browser
regression with the old adapter as the failing control, the same current core,
and assertions on scroll extent, offset and retained row identity. Public hook
signatures also exclude the compiler's internal trailing slot argument.

`tests/browser-contracts/history-append.spec.ts` holds the reconcile frame that
the chat fixture's initial `scrollToEnd()` queues, scrolls up into history,
appends and then releases the frame. With virtual-core 3.17.10 as the failing
control, the release moved `scrollTop` from 350 to 1,198 px (#2860). The
upstream fix lets an external scroll retire the pending command.

## Executable coverage

The exact release contains 11 unit registrations and 44 browser registrations,
including expanded positioning-mode cases. `audit/registrations.json` and
`audit/crosswalk.json` account for all 55. `materialize run` regenerates the Octane
adaptation using only the mechanical rewrites in the lock. No upstream runtime
assertions are removed or relaxed.

| Suite | React | Octane |
| --- | --- | --- |
| Unit | All 11 unchanged cases | All 11 mechanically adapted cases |
| Chromium | All 44 unchanged browser cases | All 44 adapted cases plus three end-anchor regressions |
| Dedicated upstream type cases | None at this release | None to materialize |
| Authored strict public type probes | All 26 exports with negative controls | The same contracts and negative controls |

Browser coverage includes cached measurements while hidden, chat prepend/append
and streaming behavior, both direct-DOM positioning modes, dynamic measurement,
scroll anchoring, smooth scrolling and stale item keys. The pristine compiler
fixture runs Babel's React Compiler. Its native counterpart runs Octane's
compiler and checks the same visible rows, style positions and render-count
bounds; this is not a claim that React Compiler compiles Octane applications.
Vite and Rolldown use explicit compilation settings because the pinned monorepo
configuration extends files outside the copied package. Test inputs remain intact.

The browser wrapper checks every expanded test identity, zero skipped or failed
cases, the process exit status and the complete report. Required parity lanes
also execute the four existing React/Octane differential scenarios, native
conformance, strict type programs and SSR/hydration. Hydration uses a real server
compile and a separately compiled client tree, retains the existing rows and
button, updates the extent and verifies observer disposal.

The only retained runtime divergence is Octane's nested `flushSync` behavior,
recorded with its executable case in `audit/react-parity.json`. Browser render
counts are deterministic performance guards; no wall-clock speedup is claimed.
