# react-i18next upstream

`@octanejs/i18next` is a port of the React-facing layer from
[`react-i18next@17.0.9`](https://github.com/i18next/react-i18next/releases/tag/v17.0.9).

## Immutable pin

- Package: `react-i18next@17.0.9`
- Tag: `v17.0.9` (annotated tag object `8bda2c7d12c9834e093042468e3d8b817ebc3f3b`)
- Commit: `8b4a9ea139b73309471737e5ba9c423f82d5c0cc`
- Repository: `https://github.com/i18next/react-i18next.git`
- Source root: `src`
- Test root: `test`
- License: MIT
- npm archive SHA-256: `3c306a9b58244804feb98b80951b9c1b9963e525bb6dc77e67ec766c2b702301`
- Supported upstream range: exactly `17.0.9`
- React oracle: `react@19.2.7` and `react-dom@19.2.7`
- Framework-neutral core: `i18next@26.3.6`

The npm package contains compiled runtime and declarations but not the complete
repository test history. The canonical tagged repository contains runtime and
TypeScript suites. Those suites have not yet been vendored and adapted
one-for-one, so the parity manifest remains `recorded-unverified`.

## Export crosswalk

| Upstream entry point or export | Octane disposition | Evidence or gap |
| --- | --- | --- |
| `Trans` | Ported | `tests/conformance/runtime.test.ts` and the bounded runtime differential; inspectable children use the documented Octane authoring form. |
| `TransWithoutContext` | Ported | `tests/conformance/runtime.test.ts` exercises the shared translation implementation. |
| `IcuTrans` | Ported | `tests/conformance/runtime.test.ts` exercises ICU declaration trees. |
| `IcuTransWithoutContext` | Ported | `tests/conformance/runtime.test.ts` exercises the shared ICU implementation. |
| `useTranslation` | Ported | The bounded differential covers translation and language subscriptions. |
| `withTranslation` | Ported | `tests/conformance/runtime.test.ts`; `withRef` follows refs-as-props and class components remain unsupported. |
| `Translation` | Ported | `tests/conformance/runtime.test.ts` exercises the render-prop API. |
| `I18nextProvider` | Ported | The bounded differential and `tests/conformance/runtime.test.ts` cover provider context. |
| `withSSR` | Ported | `tests/conformance/ssr-apis.test.ts`. |
| `useSSR` | Ported | `tests/conformance/runtime.test.ts`; a hydration differential remains open. |
| `initReactI18next` | Ported | `tests/conformance/surface.test.ts` checks the i18next third-party plugin contract. |
| `setDefaults` | Ported | Root export equality in `tests/conformance/surface.test.ts`; exhaustive upstream case adaptation remains open. |
| `getDefaults` | Ported | Root export equality in `tests/conformance/surface.test.ts`; exhaustive upstream case adaptation remains open. |
| `setI18n` | Ported | `tests/conformance/ssr-apis.test.ts`. |
| `getI18n` | Ported | Root export equality in `tests/conformance/surface.test.ts`; exhaustive upstream case adaptation remains open. |
| `nodesToString` | Ported | `tests/conformance/surface.test.ts` covers element numbering, interpolation objects, and dynamic lists. |
| `I18nContext` | Ported | Provider behavior is covered by the bounded differential; exhaustive direct context cases remain open. |
| `composeInitialProps` | Ported | `tests/conformance/ssr-apis.test.ts`. |
| `getInitialProps` | Ported | `tests/conformance/ssr-apis.test.ts`. |
| `date` | Ported compatibility helper | Root export equality in `tests/conformance/surface.test.ts`. |
| `time` | Ported compatibility helper | Root export equality in `tests/conformance/surface.test.ts`. |
| `number` | Ported compatibility helper | Root export equality in `tests/conformance/surface.test.ts`. |
| `select` | Ported compatibility helper | Root export equality in `tests/conformance/surface.test.ts`. |
| `plural` | Ported compatibility helper | Root export equality in `tests/conformance/surface.test.ts`. |
| `selectOrdinal` | Ported compatibility helper | Root export equality in `tests/conformance/surface.test.ts`. |
| `./TransWithoutContext`, `./initReactI18next` | Ported subpaths | Package surface tests. |
| `./icu.macro` | Intentional divergence | Babel/React macro integration is not published; use the runtime `IcuTrans` APIs. |
| `./package.json` | Not published | Package metadata is not part of the Octane runtime binding contract. |

## Upstream suite disposition

| Suite | Upstream state | Current disposition |
| --- | --- | --- |
| Runtime tests under `test/` | Present | Not yet vendored or adapted exhaustively. Repo-authored conformance tests cover the shipped surface, and one bounded differential runs the same `.tsrx` fixture against React and Octane. |
| TypeScript tests under `test/typescript/` | Present | Not yet vendored or adapted one-for-one. The package has an Octane public type test, but it is not counted as upstream parity evidence. |

## Bounded evidence

The `i18next-runtime-differential` lane compiles
`tests/_fixtures/runtime-diff.tsrx` for both runtimes. It compares provider,
`useTranslation`, `Trans`, and subscription output at mount and across
English-to-French-to-English language changes. This lane establishes only those
declared cases; it does not promote the package to full verified parity.

Known gaps and consumer-visible divergences remain recorded in `status.json`:
natural block children for `Trans`, Suspense mechanics, refs-as-props and class
components, the missing macro subpath, and the open hydration differential.
