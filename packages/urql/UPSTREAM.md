# Upstream provenance

`@octanejs/urql` ports the React binding of
[`urql@5.0.3`](https://github.com/urql-graphql/urql/tree/urql%405.0.3/packages/react-urql)
and re-exports `@urql/core@6.0.3`.

## Immutable pin

- Package: `urql@5.0.3`
- License: MIT
- Repository: `https://github.com/urql-graphql/urql.git` (`packages/react-urql`)
- Tag: `urql@5.0.3`
- Peeled commit: `15f622cb28eea6f5c6221a065c42468cbebb655c`
- Advertised range: exactly `5.0.3`
- npm integrity: `sha512-gWywgPjduTCUqWKofW6YLOy1auxe0uJN/vHa44eXGKn+f+QHNb308ZEZnKBLZ4F+jRrguaJy9CdtecTZJQWPCg==`
- npm shasum: `83a8682693821ff689fdab281c816e08c54a6981`
- Core dependency: `@urql/core@6.0.3` (re-exported; not reimplemented)
- Stream runtime: `wonka@^6.3.2`
- Peer: `graphql@^16.0.0` (required by `@urql/core`)

## Source boundary

- Canonical repository sources and tests: `packages/urql/upstream/canonical/`
- Published npm artifact: `packages/urql/upstream/npm/`
- Octane modules mirror `upstream/canonical/src/` (`context.ts`, `hooks/*`, `components/*`).
- `@urql/core` and `wonka` are dependencies, not vendored source.

Neither `upstream/` tree is included in the published package.

## Export crosswalk

| Upstream export | Disposition | Evidence |
| --- | --- | --- |
| All `@urql/core` exports | Reused unchanged | Re-exported from `@urql/core@6.0.3` |
| `Context` / `Provider` | Ported | `tests/useQuery.spec.test.ts` via mocked `useClient` plus Provider usage in docs |
| `Consumer` | Ported as a function component | `src/context.ts`; Octane has no `Context.Consumer` |
| `useClient` | Ported | mocked in hook tests; throws without Provider in development |
| `useRequest` | Ported | `tests/useRequest.test.ts` |
| `useQuery` | Ported | `tests/useQuery.test.ts`, `tests/useQuery.spec.test.ts` |
| `useMutation` | Ported | `tests/useMutation.test.ts` |
| `useSubscription` | Ported | `tests/useSubscription.test.ts` |
| `Query` / `Mutation` / `Subscription` | Ported render-prop components | `tests/Query.test.ts`, `tests/Mutation.test.ts` |
| `computeNextState` / `initialState` | Ported | `tests/state.test.ts` |

## Suspense

Upstream `useQuery` throws a Promise when `client.suspense` (or `context.suspense`) is on. The port keeps that throw instead of wrapping the promise in Octane `use()`, so cache write/read and replay timing stay aligned with the pinned React binding.

## Test-suite disposition

| Upstream artifact | Disposition | Evidence |
| --- | --- | --- |
| `src/hooks/useRequest.test.ts` | Ported | `tests/useRequest.test.ts` |
| `src/hooks/state.test.ts` | Ported | `tests/state.test.ts` |
| `src/hooks/useMutation.test.tsx` | Ported (renderer → testing-library) | `tests/useMutation.test.ts` |
| `src/hooks/useQuery.test.tsx` | Ported | `tests/useQuery.test.ts` |
| `src/hooks/useQuery.spec.ts` | Ported except class ErrorBoundary retry | `tests/useQuery.spec.test.ts` |
| `src/hooks/useSubscription.test.tsx` | Ported | `tests/useSubscription.test.ts` |
| `src/components/Query.test.tsx` | Ported | `tests/Query.test.ts` |
| `src/components/Mutation.test.tsx` | Ported | `tests/Mutation.test.ts` |
| `src/hooks/useQuery.spec.ts` ErrorBoundary + Suspense retry | Ported with Octane `ErrorBoundary`/`Suspense` | `tests/useQuery.spec.test.ts` |
| `src/test-utils/ssr.test.tsx` | Out of scope | Depends on `react-ssr-prepass` |
| Cypress component tests | Out of scope | Browser Cypress harness |
