# Upstream

- Repository: https://github.com/TanStack/virtual
- Package: `@tanstack/react-virtual@3.14.12`
- Release commit: `df47889fc87af0b5ff46a9805820f60cff6828ff`
- Source root: `packages/react-virtual/src`
- Test roots: `packages/react-virtual/tests` and `packages/react-virtual/e2e`
- License: MIT; exact root license in `LICENSE.upstream`
- npm artifact SHA-256: `61a7b5feaecaff7b44527675b24df7bb102ef09327b314e2f770e786b2a8412e`
- Runtime dependency: `@tanstack/virtual-core@3.17.10`, imported directly

`audit/upstream.lock.json` pins all 41 files in the upstream package, including
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

## Executable coverage

The exact release contains seven unit registrations and 35 browser registrations,
including expanded positioning-mode cases. `audit/registrations.json` and
`audit/crosswalk.json` account for all 42. `materialize run` regenerates the Octane
adaptation using only the mechanical rewrites in the lock. No upstream runtime
assertions are removed or relaxed.

| Suite | React | Octane |
| --- | --- | --- |
| Unit | Seven unchanged cases | Seven mechanically adapted cases |
| Chromium | All 35 unchanged browser cases | All 35 adapted cases plus two direct-DOM prepend regressions |
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
