# OpenTUI React upstream contract

## Pin and source boundary

| Field | Value |
|---|---|
| Package | `@opentui/react` |
| Version | `0.5.8` |
| Canonical commit | `21b002174255ca2236ed3115e2bb2294642f2cf5` |
| Supported upstream range | exactly `0.5.8` |
| npm integrity | `sha512-l3N/Kbg5V+OABp60A5iCfEj3WK5pKVUDmUrVPf/xgct9R7Xy2Jbw/0MoSFpgr3odq3CuWprYajnoLCR9f81BRQ==` |
| License | MIT |

The complete `packages/react` subtree from the canonical commit is committed
byte-for-byte under `upstream/`. Every file verifies offline against its Git
blob hash in `audit/upstream.lock.json`. The repository-root license is retained
byte-for-byte as `LICENSE.upstream`; the Octane-authored binding remains under
the repository MIT license in `LICENSE`.

The authored port lives in `src/`. It reuses `@opentui/core@0.5.8` unchanged and
independently reimplements the React renderer, reconciliation, DevTools
transport boundary, and WebSocket dependency through Octane's universal host
driver and existing runtime instrumentation. No `react`, `react-reconciler`,
`react-devtools-core`, or `ws` source is copied into the binding.

## Export crosswalk

| Upstream export group | Octane disposition | Evidence |
|---|---|---|
| `createRoot`, `Root`, `flushSync`, `createPortal` | Ported to Octane's universal renderer; roots take a component and props separately and portals target a same-renderer `RootRenderable` | `src/root.ts`, `src/scheduling.ts`, native integration tests |
| `baseComponents`, `componentCatalogue`, `extend`, `getComponentCatalogue` | Ported with the complete OpenTUI 0.5.8 built-in catalogue and custom renderable extension | `src/components.ts`, config tests |
| `AppContext`, `useAppContext` | Ported to Octane universal context | `src/context.ts`, native integration tests |
| `useRenderer`, keyboard, paste, focus, blur, selection, resize, dimensions, and timeline hooks | Ported to Octane hooks with compiler-owned slots and native OpenTUI subscriptions | `src/hooks.ts`, native integration tests |
| `createReactSlotRegistry`, `Slot`, `createSlot`, and `React*` slot types | Ported over OpenTUI core's slot registry; React-named APIs remain migration aliases for canonical `Octane*` APIs | `src/slot.ts`, native slot tests |
| `TimeToFirstDraw`, `TimeToFirstDrawProps` | Ported as a universal renderer component | `src/time-to-first-draw.ts`, public source typecheck |
| component prop types, `RenderableConstructor`, extension types, and `OpenTUIComponents` | Ported with `OctaneNode`, ordinary ref props, and renderer-specific intrinsic types | `src/types.ts`, published-source checks |
| `testRender` | Adapted to accept an Octane component plus props and execute against `@opentui/core/testing` | `src/test-utils.ts`, native integration tests |
| `./renderer` | Ported as the renderer/runtime surface plus the OpenTUI host driver | `src/renderer.ts` |
| `./jsx-runtime`, `./jsx-dev-runtime` | Replaced by the compiler-facing `./intrinsics` and `./intrinsics/jsx-runtime` entries | `src/intrinsics.ts`, config tests |
| `createElement` | Intentional divergence: Octane component trees are authored in `.opentui.tsrx`; nested runtime element construction is not supported | `README.md`, `docs/differences-from-react.md` |
| React runtime-plugin support entries | Inapplicable: applications configure the Octane compiler with `opentuiRenderers`; no runtime JSX rewrite is needed | `src/config.ts`, config tests |
| React Reconciler and React DevTools internals | Reimplemented by Octane's universal host driver and runtime instrumentation; these are not binding public exports | `src/driver.ts`, native lifecycle and identity tests |

## Upstream test-suite disposition

The pinned upstream suite contains 56 runtime registrations across seven test
files. It remains fully visible under `upstream/tests`; fixtures beside those
suites are preserved but are not registrations.

| Upstream area | Disposition |
|---|---|
| root teardown and renderer-destroy races | Covered by the native coordinated-cleanup test |
| image loading, rerender retention, prop reset, cancellation, and abandoned renders | Public image props and host lifecycle are ported; focused image parity remains an explicit follow-up rather than a claimed passing lane |
| text, layout, prop reset, keyed reconciliation, focus, and intrinsic catalogue behavior | Covered at the binding boundary by native frame, state/prop update, identity, callback, and config tests; the core layout engine itself is reused unchanged |
| link behavior | Intrinsic and prop surface ported; terminal escape rendering remains owned by unchanged `@opentui/core` |
| runtime-plugin configuration | Inapplicable because Octane compiles `.opentui.tsrx` ahead of time and exports a serializable renderer preset |
| slot modes, ordering, failures, context, identity, and teardown | Representative append/fallback, registration, error, identity, and teardown behavior covered by native slot tests |
| timeline identity | Hook implementation preserves one `Timeline` per component instance; direct adapted case remains an explicit follow-up |

The parity manifest is deliberately `recorded-unverified`: the pin and current
Octane-specific behavioral lanes are machine-checked, but this change does not
claim that all 56 React-owned upstream registrations have been adapted one for
one.
