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
the repository pin is vendored under `packages/tanstack-store/upstream/` with
`packages/react-store/src` and `packages/react-store/tests` locked file-by-file
by `upstream/SHA256SUMS`.

The ordinary package suite runs the one-for-one Octane adaptation in
`tests/_fixtures/upstream/index.tsrx`, the `_useStore` omission contracts, and a
same-fixture differential lifecycle.

## Runtime suite disposition

| Upstream artifact | Disposition |
|---|---|
| `tests/index.test.tsx` | Adapted one-for-one in `tests/_fixtures/upstream/index.tsrx` except the omitted experimental `_useStore` block. |
| `tests/test.test-d.ts` | Adapted package type assertions omit the experimental `_useStore` blocks. |

## Intentional divergences

- `@octanejs/tanstack-store` intentionally omits the experimental `_useStore` export.
  Type evidence lives in `typetests/_useStore-omission.test-d.ts` via
  `typetests/tsconfig.json`.
  Ordinary runtime evidence: `tests/conformance/experimental-use-store.parity.test.ts`
  alongside the rest of the package suite.
- Documented Octane-only divergences and SSR stay ordinary package tests.
