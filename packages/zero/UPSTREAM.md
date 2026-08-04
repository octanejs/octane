# Rocicorp Zero upstream contract

## Pin and source boundary

| Field | Value |
|---|---|
| Package | `@rocicorp/zero` |
| Version | `1.8.0` |
| Repository | `https://github.com/rocicorp/mono.git` |
| Canonical tag | `zero/v1.8.0` |
| Canonical commit | `cdc02598f137ab4e071878f5674fdc716dbbc69d` |
| Supported upstream range | exactly `1.8.0` |
| React oracle | `react@19.2.6`, as pinned by `zero-react` |
| License | Apache-2.0, Rocicorp, Inc. |

The npm artifact contains compiled output and declarations under `out/`. The
byte-exact React binding source, tests, package metadata, and license therefore
come from the canonical repository tag. They are vendored under `upstream/` and
are excluded from the published package. `upstream/SHA256SUMS` locks every
vendored byte.

The port imports the database, replication, query, mutation, schema, and client
implementation unchanged from `@rocicorp/zero`. It imports the intended UI
binding primitives from the published `@rocicorp/zero/bindings` entry point.
Only the `zero-react` context, provider, query subscription, Suspense, connection,
and online hooks are adapted.

## Export crosswalk

| Upstream `@rocicorp/zero/react` export | Octane disposition | Evidence |
|---|---|---|
| `useConnectionState` | Ported to Octane `useSyncExternalStore` | `tests/conformance/binding.test.ts` |
| `useQuery` | Ported; reuses the upstream `ViewStore` and Zero materialized views | `tests/conformance/query.test.ts`, `tests/conformance/view-store.test.ts` |
| `useSuspenseQuery` | Ported; Octane `use()` replaces the React compatibility helper | `tests/conformance/query.test.ts`, typetests |
| `MaybeQueryResult` | Ported unchanged | `typetests/public-api.test-d.ts` |
| `QueryResult` | Ported unchanged | `typetests/public-api.test-d.ts` |
| `UseQueryOptions` | Ported unchanged | `typetests/public-api.test-d.ts` |
| `useZeroOnline` | Ported to Octane `useSyncExternalStore` | `tests/conformance/binding.test.ts` |
| `createUseZero` | Ported unchanged except for the Octane hook ABI | `tests/conformance/binding.test.ts`, typetests |
| `useZero` | Ported to Octane context | `tests/conformance/binding.test.ts` |
| `ZeroContext` | Ported to Octane context | `tests/conformance/binding.test.ts` |
| `ZeroProvider` | Ported to `.tsrx`; accepts `OctaneNode` children | `tests/conformance/binding.test.ts`, `tests/conformance/provider-options.test.ts` |
| `ZeroProviderProps` | Ported with `OctaneNode` in place of `ReactNode` | `typetests/public-api.test-d.ts` |

`tests/conformance/exports.test.ts` compares both runtime namespaces in both
directions. A missing upstream export or an accidental Octane-only runtime
export fails the package suite.

The upstream `UseSuspenseQueryOptions` declaration is not exported from
`@rocicorp/zero/react` 1.8.0, so the Octane root does not add it. The upstream
inspector components are private to `zero-react` and are not part of this
package's public surface.

## Test-suite disposition

The tagged `zero-react` package contains four test files:

| Upstream test artifact | Disposition |
|---|---|
| `navigation-race.test.tsx` | Core `ViewStore` fast and slow remount cases adapted in `tests/conformance/view-store.test.ts` |
| `use-connection-state.test.tsx` | Public connection subscription behavior adapted in `tests/conformance/binding.test.ts` |
| `use-query.test.tsx` | Query materialization and Suspense behavior are adapted in `tests/conformance/query.test.ts`; result-state, error, and TTL cases remain vendored evidence |
| `zero-provider.test.tsx` | External-provider, context, ownership, option-construction, string-auth reconnect, and close behavior are adapted in `tests/conformance/binding.test.ts` and `tests/conformance/provider-options.test.ts`; state-loss rotation and the remaining auth variants remain vendored evidence |

There is no upstream `zero-react` type-test suite at this pin. The Octane port
adds a public-surface type smoke test. The remaining upstream runtime cases are
explicit test-coverage gaps, not API gaps. They must be adapted before this
package claims complete upstream-suite parity in `audit/react-parity.json`.

## Intentional differences

- Suspense uses Octane's `use()` implementation.
- Provider children use `OctaneNode` rather than `ReactNode`.
- Octane has no StrictMode double mount. The upstream delayed destruction and
  resubscription behavior is retained because it also protects real navigation
  races.
