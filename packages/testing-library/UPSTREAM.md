# React Testing Library upstream ledger

## Pin

- Package: `@testing-library/react@16.3.2`
- Repository: `https://github.com/testing-library/react-testing-library.git`
- Release tag and commit: `v16.3.2` / `f32bd1b033d5e3989ae1cb490d515ce389c54e53`
- npm tarball SHA-256: `a0ac35e67812c71b10b834a64704a2aace7e12e4ef0f2bbaea2dd3fe9fee6fe9`
- License: MIT
- React oracle: workspace React 19.2.7
- Reused DOM core: `@testing-library/dom@10.4.1`

The package reuses DOM Testing Library unchanged and ports React Testing Library's thin renderer, cleanup, hook, act-environment, and event-wrapping layer onto Octane.

## Export crosswalk

| Upstream entry/export | Octane disposition | Evidence |
| --- | --- | --- |
| root and `pure` DOM Testing Library exports | Re-exported unchanged | package dependency and all package tests |
| `render`, `rerender`, `unmount`, `asFragment` | Ported | `render.test.ts`, cleanup tests, and independent raw-React differential case |
| `cleanup` | Ported | `cleanup.test.ts` |
| `renderHook` | Ported | `renderHook.test.ts` |
| `act` and test-runner act environment | Ported | `act.test.ts` and async tests |
| `fireEvent` | Ported with native-event divergence | `events.test.ts`, `events-native-parity.test.ts` |
| hydration option | Ported onto `hydrateRoot` | `hydrate.test.ts` |
| `ReactStrictMode`, `legacyRoot`, `onCaughtError`, `onRecoverableError` options | Not ported | explicit status gap |

## Test-suite disposition

The tagged repository contains 15 React runtime test files, snapshots, and an executable TypeScript suite. They are present but not yet executed as pristine/adapted verified lanes in this recorded-unverified retrofit. Existing Octane tests cite the corresponding render, cleanup, hook, async, hydration, and event contracts as ordinary coverage. Native-event divergence cases stay in ordinary shards (`events-native-parity.test.ts`), not as adapted React parity evidence. The bounded differential lane avoids circular evidence: it mounts the React oracle with a raw `react-dom/client` root and observes both containers through native DOM APIs while the Octane side is mounted by `@octanejs/testing-library`.
