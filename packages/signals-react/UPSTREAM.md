# Upstream provenance

`@octanejs/signals-react` ports the React binding of
[`@preact/signals-react@3.12.0`](https://github.com/preactjs/signals).

## Immutable pin

- Package: `@preact/signals-react@3.12.0`
- License: MIT
- Repository: `https://github.com/preactjs/signals.git`
- Tag: `3.12.0` (peeled commit `fe12c4712752ba4d18a813a10d89fcf4f4d301bd`)
- Advertised range: exactly `3.12.0`
- npm integrity: `sha512-o3zBSekC/RPcsHOYTLagjw6JX0ih5eMMFZE0AICEeuk7p3MrYOyEXxM7bmT1Uqi0jPy2pbuDQZTFXYe55IAFVg==`
- Reused core: `@preact/signals-core@1.14.4`

## Source boundary

- Canonical repository sources and tests: `packages/signals-react/upstream/canonical/`
- Published npm artifact: `packages/signals-react/upstream/npm/`
- Octane modules mirror `upstream/canonical/{src,runtime/src,utils/src}`.
- `@preact/signals-core` is imported unchanged. The React jsx-runtime monkeypatch, Signal-as-`$$typeof` element, and `@preact/signals-react-transform` / Babel auto-tracking are explicit gaps.

Neither `upstream/` tree is included in the published package.

## Export crosswalk

The pinned package publishes `.`, `./runtime`, and `./utils`.

| Upstream export | Disposition | Evidence |
| --- | --- | --- |
| `signal` / `computed` / `batch` / `effect` / `action` / `untracked` / `createModel` / `Signal` / `ReadonlySignal` / model types | Reused verbatim from `@preact/signals-core` | `tests/exports.test.ts` |
| `useSignal` | Ported | `tests/hooks.test.ts` |
| `useComputed` | Ported | `tests/hooks.test.ts` |
| `useSignalEffect` | Ported | `tests/hooks.test.ts` |
| `useModel` | Ported | `tests/useModel.test.ts` |
| `./runtime` `useSignals` | Ported (manual slots; no react-transform plugin) | `tests/hooks.test.ts` |
| `./runtime` `wrapJsx` | Gap / no-op: Octane has no jsx-runtime to monkeypatch | `tests/wrapJsx.test.ts` |
| `./runtime` Signal-as-ReactElement (`$$typeof`) | Gap: Octane has no `react.element`; read `.value` | `src/runtime/index.ts` |
| `./utils` `Show` | Ported with `createElement` | `tests/utils.test.ts` |
| `./utils` `For` | Ported with `createElement` | `tests/utils.test.ts` |
| `./utils` `useLiveSignal` | Ported | `tests/utils.test.ts` |
| `./utils` `useSignalRef` | Ported | `tests/utils.test.ts` |
| `@preact/signals-react-transform` / Babel auto-tracking | Gap | Compile-time React transform; not an Octane runtime surface |

## Test-suite disposition

| Upstream artifact | Disposition | Evidence |
| --- | --- | --- |
| `test/browser/exports.test.tsx` | Ported | `tests/exports.test.ts` |
| `runtime/test/browser/useSignals.test.tsx` | Adapted (rerender + hook surface) | `tests/hooks.test.ts` |
| `runtime/test/browser/useModel.test.tsx` | Adapted constructor case | `tests/useModel.test.ts` |
| `runtime/test/browser/updates.test.tsx` / `mounts.test.tsx` / `suspense.test.tsx` | Out of scope: jsx-runtime wrapJsx / Signal-as-element / React Suspense internals | Recorded as wrapJsx / $$typeof gaps |
| `utils/test/browser/index.test.tsx` | Adapted Show / For / useLiveSignal / useSignalRef | `tests/utils.test.ts` |
| `test/browser/react-router.test.tsx` | Out of scope: react-router integration | Not applicable |
| `test/node/renderToStaticMarkup.test.tsx` / `runtime/test/node/renderToStaticMarkup.test.tsx` | Out of scope: ReactDOMServer | Not applicable |

## Intentional divergences

- `wrapJsx` returns its input unchanged. Octane compiles `.tsrx`; there is no `jsx-runtime` to patch.
- A `Signal` is not a text/host child. Read `.value` (or wrap the component with `useSignals`).
- Auto-tracking via `@preact/signals-react-transform` is not ported. Call `useSignals()` in components that read signals during render.
- Utils `Show` / `For` render with `createElement` and `OctaneNode` children.
