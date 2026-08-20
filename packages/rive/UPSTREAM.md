# Upstream crosswalk

## Pin

- React package: `@rive-app/react-canvas@4.32.0` (MIT)
- Canonical repository: <https://github.com/rive-app/rive-react>
- Tag: `v4.32.0`
- Peeled commit: `af85cadd907fd93c950acc5a2338d275f80dfe2d` (recorded in [`upstream/COMMIT`](./upstream/COMMIT))
- Integrity: `sha512-3r+9xZmdPZTLGNhHq3QuFKVtkPCRnpx6icSqIRUnpGDOmA1U3eADb2crSuwh9voXtHJ0ddexagF+zYmSIC+1ug==`
- shasum: `59198561130aceac35bf0f754fc0884ce989fc5b`
- Official canvas wrapper only (`@rive-app/react-canvas`, not `react-webgl`)
- Reused core: `@rive-app/canvas@2.40.0` (re-exported unchanged, matching upstream)

The published tarball is a built `dist/` artifact. The canonical repository at the commit above supplies the TypeScript source and Jest suite. Those files are vendored byte-for-byte under [`upstream/canonical/`](./upstream/canonical/) and [`upstream/npm/`](./upstream/npm/). The MIT license is at [`upstream/LICENSE`](./upstream/LICENSE). Vendored trees are excluded from the published package by the manifest `files` list.

## Source boundary

`src/` mirrors the vendored React binding:

| Upstream | Octane |
| --- | --- |
| `canonical/src/index.ts` | `src/index.ts` |
| `canonical/src/types.ts` | `src/types.ts` |
| `canonical/src/utils.ts` | `src/utils.ts` |
| `canonical/src/bindScheduler.ts` | `src/bindScheduler.ts` |
| `canonical/src/resolveViewModelInstance.ts` | `src/resolveViewModelInstance.ts` |
| `canonical/src/components/Rive.tsx` | `src/components/Rive.ts` |
| `canonical/src/hooks/*` | `src/hooks/*` |

`@rive-app/canvas` is imported and `export *`'d unchanged. JSX in `useRive` / `Rive` is rewritten with Octane `createElement`. There is no `forwardRef`. Hooks live in plain `.ts` and forward compiler slots through `splitSlot` / `subSlot`.

## Export crosswalk

The pinned package has one public entry point, `@rive-app/react-canvas`.

| Upstream export | Octane disposition | Evidence |
| --- | --- | --- |
| default `Rive` | Ported (`createElement` canvas wrapper; no `forwardRef`) | [`tests/contracts.test.ts`](./tests/contracts.test.ts); `// Per packages/rive/upstream/canonical/test/Rive.test.tsx` |
| `useRive` | Ported with manual hook slots | [`tests/contracts.test.ts`](./tests/contracts.test.ts); `// Per packages/rive/upstream/canonical/test/useRive.test.tsx` |
| `useStateMachineInput` | Ported with manual hook slots | [`tests/contracts.test.ts`](./tests/contracts.test.ts); `// Per packages/rive/upstream/canonical/test/useStateMachine.test.tsx` |
| `useResizeCanvas` | Ported with manual hook slots | Implementation mirror of `canonical/src/hooks/useResizeCanvas.ts` |
| `useRiveFile` | Ported with manual hook slots | Implementation mirror of `canonical/src/hooks/useRiveFile.ts` |
| `useViewModel` | Ported with manual hook slots | Implementation mirror of `canonical/src/hooks/useViewModel.ts` |
| `useViewModelInstance` | Ported with manual hook slots | Implementation mirror of `canonical/src/hooks/useViewModelInstance.ts` |
| `useGlobalViewModelInstance` | Ported with manual hook slots | Implementation mirror of `canonical/src/hooks/useGlobalViewModelInstance.ts` |
| `useViewModelInstanceNumber` | Ported | Implementation mirror |
| `useViewModelInstanceString` | Ported | Implementation mirror |
| `useViewModelInstanceBoolean` | Ported | Implementation mirror |
| `useViewModelInstanceColor` | Ported | Implementation mirror |
| `useViewModelInstanceEnum` | Ported | Implementation mirror |
| `useViewModelInstanceTrigger` | Ported | Implementation mirror |
| `useViewModelInstanceImage` | Ported | Implementation mirror |
| `useViewModelInstanceFont` | Ported | Implementation mirror |
| `useViewModelInstanceList` | Ported | Implementation mirror |
| `useViewModelInstanceArtboard` | Ported | Implementation mirror |
| `RiveProps` | Ported type | [`src/components/Rive.ts`](./src/components/Rive.ts) |
| `RiveState`, `UseRiveParameters`, `UseRiveFileParameters`, `UseRiveOptions` | Ported types | [`src/types.ts`](./src/types.ts) |
| `export *` from `@rive-app/canvas` | Reused verbatim | [`tests/contracts.test.ts`](./tests/contracts.test.ts) (`EventType`, `Fit`, `Alignment`, `Layout`) |

`@rive-app/react-webgl` / `react-webgl2` are out of scope. This port is the official canvas wrapper only.

## Test disposition

Upstream Jest lives at [`upstream/canonical/test/`](./upstream/canonical/test/). Real Rive WASM cannot run reliably in jsdom, so this package commits contract tests rather than a full WASM load path. Every committed test executes. Unported cases are recorded here, not skipped.

| Upstream file | Disposition | Notes |
| --- | --- | --- |
| `test/useRive.test.tsx` | adapted-partial | Contract: `rive === null` before load; `setCanvasRef` / `setContainerRef` / `RiveComponent` present; `RiveComponent` renders a canvas. Remaining cases need a mocked `Rive` constructor plus canvas sizing / IntersectionObserver and are WASM/canvas-scoped. |
| `test/Rive.test.tsx` | adapted-partial | Contract: default `Rive` renders a `div` wrapper and `canvas`. Children-in-canvas remains WASM/canvas-scoped. |
| `test/useStateMachine.test.tsx` | adapted-partial | Contract: `useStateMachineInput(null)` returns `null`. Named-input lookup needs a loaded runtime. |
| `test/useRiveFile.test.tsx` | out of scope | WASM / `RiveFile` constructor and load events. |
| `test/useViewModelInstance.test.tsx` | out of scope | Requires a live ViewModel / `bind()` runtime. |
| `test/useGlobalViewModelInstance.test.tsx` | out of scope | Requires a live ViewModel / global bind runtime. |
| `test/useViewModelInstanceFont.test.tsx` | out of scope | Requires decoded fonts and a live ViewModel instance. |
| `test/elementObserver.test.tsx` | out of scope | IntersectionObserver + canvas element registration. |
| `test/useIntersectionObserver.test.tsx` | out of scope | IntersectionObserver + canvas element registration. |
| `test/bindScheduler.test.tsx` | out of scope | Requires a real `Rive.bind()` implementation. |
| `setupTests.ts` | out of scope | Jest + jsdom harness, not a behavior case. |
| `jest.config.js` | out of scope | Jest runner config. |

Classification of committed Octane tests:

| Port test | Classification |
| --- | --- |
| re-export surface | Octane-only framework contract (unpaired: export inventory, not a React render case) |
| `useRive` null-before-load / ref / `RiveComponent` | adapted-partial upstream (`useRive.test.tsx`) |
| `RiveComponent` / default `Rive` canvas wrapper | adapted-partial upstream (`useRive.test.tsx`, `Rive.test.tsx`) |
| `useStateMachineInput(null)` | adapted-partial upstream (`useStateMachine.test.tsx`) |
