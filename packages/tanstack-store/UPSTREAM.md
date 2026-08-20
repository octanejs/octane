# Upstream

## Pin and oracle boundary

| Field | Value |
|---|---|
| Repository | https://github.com/TanStack/store |
| Release tag | `@tanstack/react-store@0.11.0` |
| Commit | `83e2978f627ec53616249b2bda1037749b18b6ab` |
| Supported upstream range | exactly `@tanstack/react-store@0.11.0` |
| React oracle | `react@19.2.3`, `react-dom@19.2.3`, `@types/react@19.2.7` |
| npm tarball SHA-256 | `00e8fa1891d1b70a83838b15aec65ea5817c7b88aa737ead07dea9dbce14897f` |
| Source root | `packages/react-store/src` |
| Test root | `packages/react-store/tests` |
| License | MIT |

The tagged repository contains the upstream runtime and compile-time suites. The
published npm artifact contains source and declarations but omits those tests, so
the repository pin is vendored under `packages/tanstack-store/upstream/` and pinned by
`audit/upstream.lock.json`: each committed file verifies offline against its upstream git blob
sha at the pinned commit (`pnpm react-port:materialize run --check --package-dir
packages/tanstack-store`). The upstream MIT license is retained byte-exact as
`LICENSE.upstream`, hash-matched to the lock.

Run `pnpm --dir packages/tanstack-store upstream:verify` to verify every vendored
byte. The pristine React-parity lanes run that same verifier before copying or
executing the upstream suite.

## React-parity lanes

Paired pristine and adapted lanes are required evidence; bounded differential and
adapted-only lanes are supplementary.

| Lane | Disposition |
|---|---|
| `tanstack-store-pristine-upstream` | Runs the byte-exact `packages/react-store/tests/index.test.tsx` suite against `@tanstack/react-store@0.11.0` after vendored-byte verification. |
| `tanstack-store-adapted-upstream` | Runs the one-for-one Octane adaptation in `tests/_fixtures/upstream/index.tsrx` through `tests/conformance/upstream-index.test.ts`. Omits the upstream `_useStore` describe block by design. |
| `tanstack-store-pristine-types` | Runs vendored `upstream/tests/test.test-d.ts` with `tsc` against the pinned React binding, including `_useStore` typetests. |
| `tanstack-store-adapted-types` | Runs the structurally equivalent Octane typetest in `typetests/test.test-d.ts` with `tsrx-tsc` via `typetests/tsconfig.adapted.json`. `_useStore` typetests are pristine-only. |
| `tanstack-store-useStore-omission-types` | Compiles the authenticated Octane-only `_useStore` omission typetest via `typetests/tsconfig.json`. Ordinary runtime omission evidence stays outside react-parity ownership. |
| `tanstack-store-runtime-differential` | Supplementary exact shared React/Octane interaction fixture. |

## Runtime suite disposition

| Upstream artifact | Disposition |
|---|---|
| `tests/index.test.tsx` | Pristine lane runs unchanged. Adapted one-for-one in `tests/_fixtures/upstream/index.tsrx` except the `_useStore` describe block (`returns selected state and actions for stores with actions`, `returns selected state and setState for plain stores`), which is classified outside adapted parity evidence. |
| `tests/test-setup.ts` | Shared cleanup setup used by the pristine lane unchanged. |
| `tests/test.test-d.ts` | Pristine types lane runs unchanged. Adapted types mirror every assertion group except the `_useStore` blocks. |
| `src/*` | Vendored for pristine runtime/type execution because the upstream suite imports `../src/index`. |

## Intentional divergences

- `@octanejs/tanstack-store` intentionally omits the experimental `_useStore` export.
  Required type evidence lane: `tanstack-store-useStore-omission-types`
  (`typetests/_useStore-omission.test-d.ts` via `typetests/tsconfig.json`).
  Ordinary runtime evidence: `tests/conformance/experimental-use-store.parity.test.ts`
  (outside react-parity ownership).
- Documented Octane-only divergences and SSR stay ordinary package tests outside
  React-parity ownership.
