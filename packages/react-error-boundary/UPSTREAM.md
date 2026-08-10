# react-error-boundary upstream contract

## Pin and source boundary

| Field | Value |
|---|---|
| Package | `react-error-boundary` |
| Version | `6.1.2` |
| Canonical commit | `90b9a7e8766faa7890eff14ffedc77ea80740179` |
| Supported upstream range | exactly `6.1.2` |
| React oracle | `19.2.7` |
| Canonical archive SHA-256 | `74ba770d513712aaab909ffe27209804739a33896c2635f974eddf141661901f` |
| License | MIT |

The npm package contains compiled output and declarations. The canonical
repository contains source and three runtime test files under `lib/`. Those
pristine artifacts have not yet been vendored or executed here, so the parity
manifest records this pin as `recorded-unverified`.

## Export crosswalk

| Upstream export | Octane disposition | Evidence |
|---|---|---|
| `ErrorBoundary` | Ported to Octane's native boundary | `tests/fallbacks.test.ts`, `tests/reset.test.ts`, differential reset lane |
| `ErrorBoundaryContext` | Ported to Octane context | `tests/use-error-boundary.test.ts` |
| `getErrorMessage` | Ported unchanged | `tests/use-error-boundary.test.ts` |
| `useErrorBoundary` | Ported to Octane hooks | `tests/use-error-boundary.test.ts` |
| `withErrorBoundary` | Ported to an Octane wrapper | `tests/fallbacks.test.ts`, public typetest |
| Public prop/callback/API types | Ported structurally | `typetests/public-api.ts` |

The explicit Octane `/server` entry is an extension: it preserves upstream
server error propagation without pretending that a client boundary catches
SSR errors. Component stack text remains an explicit divergence because Octane
does not expose a public component-stack formatter.

## Test-suite disposition

Upstream runtime suites exist for `ErrorBoundary`, `useErrorBoundary`, and
`withErrorBoundary`; no independent upstream type suite is present at this pin.
The current Octane tests are repository-authored adaptations and contracts.
Only the shared imperative-reset fixture is registered as bounded React parity
evidence. Advancing the manifest to `verified` requires byte-exact vendoring,
pristine execution, one-for-one adaptation, and exhaustive test classification.
