# Upstream provenance

`@octanejs/oidc-context` ports the React binding of
[`react-oidc-context@3.3.1`](https://github.com/authts/react-oidc-context/tree/v3.3.1).

## Immutable pin

- Package: `react-oidc-context@3.3.1`
- License: MIT
- Repository: `https://github.com/authts/react-oidc-context.git`
- Tag: `v3.3.1`
- Commit: `af7e8af7562e8da329a86ddc52641ef5bea65640`
- Advertised range: exactly `3.3.1`
- npm integrity: `sha512-/Azvm9W4DhhOtSDBE73kFInh1b6zZRRfILKbgmk2syExMF0PCYJOn/dGdOOi2BFX8x0rCeUe45NXHU+/+xDcrQ==`
- npm shasum: `34292c2ac365cbdbcd3e8da30a2ae49fb21a3c05`
- Peer: `oidc-client-ts@^3.1.0` (Apache-2.0). The port depends on that package as a peer/devDependency (`oidc-client-ts@3.5.0`) and does **not** vendor its source.

## Source boundary

- Canonical repository sources and tests: `packages/oidc-context/upstream/canonical/`
- Published npm artifact: `packages/oidc-context/upstream/npm/`
- Octane modules mirror `upstream/canonical/src/` one-for-one.
- `oidc-client-ts` stays an external peer. Only `react-oidc-context` React-facing modules are reimplemented on Octane hooks/`createElement`.

Neither `upstream/` tree is included in the published package.

## Export crosswalk

| Upstream export | Disposition | Evidence |
| --- | --- | --- |
| `AuthContext` | Ported (`createContext` from `octane`) | `tests/useAuth.test.ts` |
| `AuthProvider` | Ported | `tests/AuthProvider.test.ts` |
| `AuthState` / `ErrorContext` | Ported types | AuthProvider error cases |
| `useAuth` | Ported | `tests/useAuth.test.ts` |
| `useAutoSignin` | Ported | `tests/useAutoSignin.test.ts` |
| `hasAuthParams` | Ported (framework-neutral) | `tests/hasAuthParams.test.ts` |
| `withAuth` | Ported as a function HOC using `createElement` | `tests/withAuth.test.ts` |
| `withAuthenticationRequired` | Ported as a function HOC using `createElement` | `tests/withAuthenticationRequired.test.ts` |
| `reducer` (internal) | Ported | exercised via `AuthProvider` |

## Test-suite disposition

| Upstream artifact | Disposition | Evidence |
| --- | --- | --- |
| `test/utils.test.tsx` | Ported | `tests/hasAuthParams.test.ts` |
| `test/useAuth.test.tsx` | Ported | `tests/useAuth.test.ts` |
| `test/AuthProvider.test.tsx` | Ported | `tests/AuthProvider.test.ts` |
| `test/useAutoSignin.test.tsx` | Ported | `tests/useAutoSignin.test.ts` |
| `test/withAuth.test.tsx` | Ported; class fixtures rewritten as functions | `tests/withAuth.test.ts` |
| `test/withAuthenticationRequired.test.tsx` | Ported | `tests/withAuthenticationRequired.test.ts` |
| `test/SSR.test.tsx` | Ported | `tests/ssr.test.ts` |
| `test/helpers.tsx` | Ported (no StrictMode wrapper) | `tests/helpers.ts` |
| `test/__mocks__/oidc-client-ts.ts` | Ported | `tests/_mocks/oidc-client-ts.ts` |
