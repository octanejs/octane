# react-i18next upstream

`@octanejs/i18next` is a port of the React-facing layer from
[`react-i18next@17.0.14`](https://github.com/i18next/react-i18next/releases/tag/v17.0.14).

## Immutable pin

- Package: `react-i18next@17.0.14`
- Tag: `v17.0.14` (annotated tag object `b785183e58b1680ddc97e1466158936bda1697e2`)
- Commit: `5f8c5f9e6c7cdabdc476111d0748c91e33bbaa30`
- Repository: `https://github.com/i18next/react-i18next.git`
- Source root: `src`
- Test root: `test`
- License: MIT
- npm archive SHA-256: `ff6684f1e130a688f6d68e67f80bb43279c2daf46f0af8abe96c4793d6d532ec`
- npm archive integrity: `sha512-ZpMBfJL3BiXPuYHj5QMY1GwvKJNhE1vCxOJQ8BoMBdHP5XONTfi/Qss1nuRlnFdIl72PKo2jPmw+fxuLjRFgaQ==`
- Supported upstream range: exactly `17.0.14`
- React oracle: `react@19.2.8` and `react-dom@19.2.8`
- Framework-neutral core: `i18next@26.4.0`

`audit/upstream.lock.json` authenticates the complete pinned repository source
and test subtree; `pnpm --dir packages/i18next upstream:materialize` regenerates
`upstream/` and `tests/upstream/` from it. `upstream-artifact/` retains the exact
npm tarball and its published metadata, license, and declarations;
`audit/provenance.json` authenticates those bytes. `LICENSE.upstream` preserves
the upstream MIT notice. `pnpm --dir packages/i18next upstream:verify` re-checks
the pinned tree and artifact.

## Source boundary

`src/` is the copied and rewritten boundary: every module except
`src/internal.js` adapts the same-named file under upstream `src/` to the Octane
runtime — JSX becomes descriptor literals, Suspense uses `use(thenable)`, refs
are plain props, and context flows through `octane`. `src/internal.js` is
authored Octane slot mechanics for the published plain-JS hook layer.
`audit/source-ledger.json` and `audit/closure.json` record hashes for the
complete shipped closure and identify the adapted boundary.

The vendored `upstream/` tree, `tests/upstream/`, `typetests/`, `audit/`, and
`upstream-artifact/` are test and provenance evidence only; none of it is
published in the package tarball.

## Export crosswalk

| Upstream entry point or export | Octane disposition | Evidence or gap |
| --- | --- | --- |
| `Trans` | Ported | Adapted upstream suite plus `tests/conformance/runtime.test.ts` and the runtime differential; inspectable children use the documented Octane authoring form. |
| `TransWithoutContext` | Ported | Adapted upstream suite and `tests/conformance/runtime.test.ts` exercise the shared translation implementation. |
| `IcuTrans` | Ported | Adapted upstream suite exercises ICU declaration trees. |
| `IcuTransWithoutContext` | Ported | Adapted upstream suite exercises the shared ICU implementation. |
| `useTranslation` | Ported | Adapted upstream suite and the differential cover translation and language subscriptions. |
| `withTranslation` | Ported | Adapted upstream suite; `withRef` follows refs-as-props and class components remain unsupported. |
| `Translation` | Ported | Adapted upstream suite exercises the render-prop API. |
| `I18nextProvider` | Ported | Adapted upstream suite and the differential cover provider context. |
| `withSSR` | Ported | Adapted upstream type suite and `tests/conformance/ssr-apis.test.ts`. |
| `useSSR` | Ported | Adapted upstream suite; a hydration differential remains open. |
| `initReactI18next` | Ported | `tests/conformance/surface.test.ts` checks the i18next third-party plugin contract. |
| `setDefaults` | Ported | Adapted upstream suite and root export equality in `tests/conformance/surface.test.ts`. |
| `getDefaults` | Ported | Adapted upstream suite and root export equality in `tests/conformance/surface.test.ts`. |
| `setI18n` | Ported | Adapted upstream suite and `tests/conformance/ssr-apis.test.ts`. |
| `getI18n` | Ported | Adapted upstream suite and root export equality in `tests/conformance/surface.test.ts`. |
| `nodesToString` | Ported | Adapted `trans.nodeToString` suite and `tests/conformance/surface.test.ts` cover element numbering, interpolation objects, and dynamic lists. |
| `I18nContext` | Ported | Provider behavior is covered by the adapted suite and the differential. |
| `composeInitialProps` | Ported | `tests/conformance/ssr-apis.test.ts`. |
| `getInitialProps` | Ported | `tests/conformance/ssr-apis.test.ts`. |
| `date` | Ported compatibility helper | Root export equality in `tests/conformance/surface.test.ts`. |
| `time` | Ported compatibility helper | Root export equality in `tests/conformance/surface.test.ts`. |
| `number` | Ported compatibility helper | Root export equality in `tests/conformance/surface.test.ts`. |
| `select` | Ported compatibility helper | Root export equality in `tests/conformance/surface.test.ts`. |
| `plural` | Ported compatibility helper | Root export equality in `tests/conformance/surface.test.ts`. |
| `selectOrdinal` | Ported compatibility helper | Root export equality in `tests/conformance/surface.test.ts`. |
| `./TransWithoutContext`, `./initReactI18next` | Ported subpaths | Package surface tests. |
| `./icu.macro` | Intentional divergence | Babel/React macro integration is not published; use the runtime `IcuTrans` APIs. The 37 macro compile-time cases stay exercised only in the pristine React lane and are recorded `unsupported` in `audit/crosswalk.json`. |
| `./package.json` | Not published | Package metadata is not part of the Octane runtime binding contract. |

## Upstream suite disposition

| Suite | Upstream state | Current disposition |
| --- | --- | --- |
| Runtime tests under `test/` | Present | Vendored and adapted one-for-one. The pristine `i18next-pristine-runtime` lane runs all 495 upstream tests unchanged; the adapted `i18next-adapted` lane runs all 458 Octane tests (the 37 `icu.macro` Babel-transform cases have no Octane counterpart and are recorded `unsupported`). |
| TypeScript tests under `test/typescript/` | Present | Vendored and adapted one-for-one across seven pristine and seven adapted `tsc`/`tsrx-tsc` programs mirroring upstream's per-directory configs; all 314 pinned type registrations are covered. |

## Parity evidence

`audit/react-parity.json` records the verified manifest: pristine and adapted
full runtime lanes, fourteen type lanes, the runtime differential, and the
server-render lane. Committed patches under `audit/upstream-patches/` contain
only the Octane adaptations, each marked with a declared
`OCTANE DIVERGENCE[...]` id: `inspectable-children`, `function-components`,
`component-signature`, `dom-markers`, `class-components`,
`fragment-descriptors`, and `children-typing`.

The `i18next-runtime-differential` lane compiles
`tests/_fixtures/runtime-diff.tsrx` for both runtimes. It compares provider,
`useTranslation`, `Trans`, and subscription output at mount and across
English-to-French-to-English language changes.

Consumer-visible divergences remain recorded in `status.json`: natural block
children for `Trans`, Suspense mechanics, refs-as-props and class components,
the missing macro subpath, and the open hydration differential.
