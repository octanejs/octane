# Zustand upstream ledger

## Pin

- Package: `zustand@5.0.14`
- Repository: `https://github.com/pmndrs/zustand.git`
- Release tag: `v5.0.14`
- Annotated tag object: `8fb7eca3757b25cf28f4acd2f8b0da3ff4fac68c`
- Commit: `bfb2a9e7ce52608d54d8a077fb87ac9d12e73c58`
- npm tarball SHA-256: `c1fad9e123a79d12f56b4ef8aece6abd6036df164b01d7ffb52d40b08956e96b`
- License: MIT
- React oracle: workspace React 19.2.7

The binding reuses the pinned framework-neutral vanilla store, shallow comparator, and middleware. It adapts the React-facing `create`, `useStore`, `createWithEqualityFn`, `useStoreWithEqualityFn`, and `useShallow` hooks onto Octane subscriptions.

## Export crosswalk

| Upstream entry | Octane entry | Disposition | Evidence |
| --- | --- | --- | --- |
| `zustand` | `@octanejs/zustand` | React hooks ported; vanilla exports reused | differential counter/multistore cases and `conformance/binding.test.ts` |
| `zustand/vanilla` | `@octanejs/zustand/vanilla` | Re-exported unchanged | conformance tests |
| `zustand/shallow` and `zustand/react/shallow` | `@octanejs/zustand/shallow` | Comparator reused; hook ported | `conformance/extras.test.ts` |
| `zustand/middleware` | `@octanejs/zustand/middleware` | Re-exported unchanged | `conformance/extras.test.ts` |
| `zustand/traditional` | `@octanejs/zustand/traditional` | Equality hooks ported | `conformance/traditional.test.ts` |

## Test-suite disposition

The canonical tag includes React runtime suites for basic hooks, shallow selection, SSR, subscriptions, persistence, devtools, and middleware, plus embedded type assertions. They are present but not executed unchanged here. Two exact same-fixture React/Octane scenarios cover representative selection, actions, and multiple-store behavior; Octane-only ordinary-shard coverage authenticates equality and the unstable-selector divergence (not adapted React parity evidence). The upstream type suite is broad and intertwined with React fixtures, so this recorded-unverified retrofit carries a focused executable public declaration contract rather than claiming one-for-one adapted coverage.
