# Upstream @monaco-editor/react audit

This port targets `@monaco-editor/react@4.7.0` at git commit
`eb120e66378471315620fe5339b73ba003f199ad` (recorded in `upstream/COMMIT`).

- repository: `https://github.com/suren-atoyan/monaco-react`
- package version: `4.7.0`
- vendored commit: `eb120e66378471315620fe5339b73ba003f199ad`
- loader: `@monaco-editor/loader@1.7.0` (framework-neutral; imported, not vendored)
- monaco oracle: `monaco-editor@0.55.1` (catalog / Echo validation pin)
- license: MIT, Copyright (c) 2018 Suren Atoyan

## Audit artifacts

React-parity evidence lives under `audit/` and is regenerated with:

```bash
pnpm --filter @octanejs/monaco-editor parity:generate
```

| File | Role |
| --- | --- |
| `audit/react-parity.json` | Bounded parity manifest (lanes, divergences, integrity) |
| `audit/adapted-runtime.json` | Adapted upstream case inventory |
| `audit/pristine-runtime.json` | Six vendored upstream RTL spec identities |
| `audit/pristine-wrapper-runtime.json` | Wrapper identity for `tests/upstream-original.test.ts` |
| `audit/differential-runtime.json` | React/Octane differential case inventory |
| `audit/pristine-types.json` / `audit/adapted-types.json` | Per-group type assertion inventories |
| `audit/type-transformations.json` | Permitted type-lane transforms ledger |
| `audit/test-classifications.json` | Disposition for every test and typetest file |

Pristine runtime specs run against **React 19.2.7** via `tests/upstream-pristine.vitest.config.ts` and `scripts/run-pristine-upstream.mjs`.

## Immutable React oracle

Differential and pristine typetest lanes compile fixtures against pinned React
packages (exact versions):

| Package | Version |
| --- | --- |
| `react` | `19.2.7` |
| `react-dom` | `19.2.7` |
| `@types/react` | `19.2.7` |

Advertised peers match upstream: `monaco-editor >= 0.25.0 < 1`, plus Octane
instead of React.

## Source boundary

Vendored byte-exact under `upstream/` (prettier-ignored, unpublished):

- `upstream/src/**` — React binding source + Vitest specs + snapshots
- `upstream/LICENSE`, `upstream/package.json`, `upstream/COMMIT`

Everything under `src/` is re-implemented against Octane hooks / `.tsrx`.
`@monaco-editor/loader` is imported unchanged (not vendored).

## Export crosswalk

Every runtime and type export of `src/index.ts` at the pin.

| Export | Kind | Disposition | Evidence |
| --- | --- | --- | --- |
| `Editor` (also `default`) | component | ported | `tests/upstream/editor-shell.test.ts`, `tests/runtime/editor.test.ts`, differential, browser, SSR, hydration |
| `DiffEditor` | component | ported | `tests/upstream/diff-editor-shell.test.ts`, `tests/runtime/editor.test.ts`, differential, browser, SSR |
| `loader` | re-export | reused verbatim (`@monaco-editor/loader`) | shell tests + browser harness |
| `useMonaco` | hook | ported | `tests/runtime/use-monaco.test.ts`, differential |
| `OnMount` / `BeforeMount` / `OnChange` / `OnValidate` / `EditorProps` | types | ported (`ReactNode`→`OctaneNode`) | typetests |
| `MonacoDiffEditor` / `DiffOnMount` / `DiffBeforeMount` / `DiffEditorProps` | types | ported | typetests |
| `Monaco` | type | ported | typetests |
| `Theme` | type | ported | typetests |

### Intentional divergences

| Surface | Upstream (4.7.0) | Octane port |
| --- | --- | --- |
| JSX dialect | `.tsx` / React hooks | `.tsrx` / `@jsxImportSource octane`; ship source, never compiler output |
| `loading` | `ReactNode` | `OctaneNode` (string still accepted at runtime) |
| MonacoContainer ref | private `_ref` prop on container div | Octane `ref` as an ordinary prop on the host div |
| Model disposal | `editorRef.current!.getModel()?.dispose()` on unmount when `keepCurrentModel` is false — disposes whatever model is attached, including externally created models | **Ownership-aware dispose** via `WeakSet` (binding-created models) and `WeakMap` lease counts; only binding-owned models are disposed, and superseded owned path models are cleaned up on unmount |
| View state storage | process-global `Map` keyed by **path string** (`const viewStates = new Map()` in `upstream/src/Editor/Editor.tsx`) | process-global `WeakMap` keyed by **model identity** (`modelViewStates` in `src/Editor/Editor.tsrx`) so kept models retain view state after path changes |
| `'use client'` | present on upstream Editor/DiffEditor | omitted; browser-only behavior via effects |
| `CSSProperties` | React `CSSProperties` in style modules | plain `Record<string, Record<string, string \| number>>` style records |
| StrictMode double-invoke | upstream dev behavior | N/A — not tested |

## Test disposition

| Upstream file | Disposition |
| --- | --- |
| `src/Loading/index.spec.tsx` | **ported** → `tests/upstream/loading.test.ts` (+ `.tsrx` fixture) |
| `src/MonacoContainer/index.spec.tsx` | **ported** → `tests/upstream/monaco-container.test.ts` (passes `ref=`, not `_ref`) |
| `src/Editor/index.spec.tsx` | **ported** → `tests/upstream/editor-shell.test.ts` (loader mocked) |
| `src/DiffEditor/index.spec.tsx` | **ported** → `tests/upstream/diff-editor-shell.test.ts` |
| `**/__snapshots__/*.snap` | Adapted to container HTML / style assertions — RTL render-object snapshots are harness noise |

Upstream ships **no type tests**. Both type lanes are port-authored.

## Port-authored test classification

| File / directory | Classification | Pairing |
| --- | --- | --- |
| `tests/upstream/*.test.ts` | adapted upstream | re-authors the four upstream RTL snapshot specs only |
| `tests/runtime/*.test.ts` | Octane-only runtime contract | unpaired — lifecycle, loader race, useMonaco, public surface against monaco doubles |
| `tests/differential/parity.test.ts` | React/Octane differential | pinned `@monaco-editor/react@4.7.0` |
| `tests/ssr/ssr.test.ts` | Octane-only framework contract | unpaired — upstream ships no SSR suite |
| `tests/hydration/hydration.test.ts` | Octane-only framework contract | unpaired — hydration adoption is Octane's |
| `tests/browser/editor.browser.test.ts` | Octane-only browser contract | unpaired — real Monaco + Vite `?worker` harness |
| `tests/harness/negative-controls.test.ts` | harness negative controls | unpaired — inventory titles / divergence citation; not adapted-lane evidence |
| `typetests/{pristine,adapted}/types.test-d.ts` | port-authored type lanes | paired with each other through `typetests/assertions.md` |

## Evidence lanes

- Adapted upstream snapshot ports (Loading / MonacoContainer / Editor / DiffEditor shells)
- Port-authored runtime lifecycle/useMonaco/loader-race suites (mocked loader + monaco doubles)
- React/Octane differential with pinned `@monaco-editor/react@4.7.0` (loading-shell + held-init useMonaco pending `step`s)
- SSR loading shell (`tests/ssr`) and hydration DOM adoption (`tests/hydration`)
- Package Chromium browser + npm workers (`tests/browser`), including language/theme sync and controlled-value remount
- Example consumer: [`examples/monaco-playground`](../../examples/monaco-playground)
