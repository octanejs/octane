# react-grab upstream

`@octanejs/grab` ports `react-grab` 0.2.0 to Octane: the activation/selection overlay, copy flow, context menu, plugins, and the element/component-stack inspection surface.

## Immutable identity and license

- Release: `react-grab@0.2.0`
- Commit: `23bce0e56f2808902f1126ad581f6d8c3b5f639e`
- Source: https://github.com/aidenybai/react-grab/tree/23bce0e56f2808902f1126ad581f6d8c3b5f639e
- MIT license: exact upstream bytes in packaged `LICENSE.upstream`; SHA-256 `3cb91aec78b7a54136b60a81055a3e1e5bac3c2d47d06dc866948129e4cd4f45`.
- npm integrity: `sha512-ohhsfXD4qN0j6cMQd56aaVJBPDF3kUdviF/Od1Eak/rEIXQ3svQ4gjkwTfuTZwTBnxHRL16p9JqdlVQO5nUHqA==`.
- npm archive SHA-256: recorded as `provenance.integrity` in `audit/react-parity.json` and pinned in `audit/provenance.json`.

`audit/upstream.lock.json` authenticates the byte-exact repository source and tests under `upstream/`. The npm tarball is retained at `upstream-artifact/react-grab-0.2.0.tgz` for published-declaration verification. Neither tree is published.

## Complete export crosswalk

Every published upstream entry point has an Octane counterpart with the same export names. Upstream's `./dist/*` wildcard entries expose build artifacts and are intentionally not mirrored; the package ships authored source.

| Entry | Exports | Disposition |
| --- | --- | --- |
| `@octanejs/grab` | `init`, `getStack`, `formatElementInfo`, `isInstrumentationActive`, `DEFAULT_THEME`, `commentPlugin`, `openPlugin`, `FreezeError`, `OpenFileError`, `generateSnippet`, `PluginSetupError`, `ReactGrabError`, `getGlobalApi`, `setGlobalApi`, `registerPlugin`, `unregisterPlugin`, plus all option/state/theme/context types | Ported to Octane. |
| `@octanejs/grab/core` | `init`, `getStack`, `formatElementInfo`, `isInstrumentationActive`, `DEFAULT_THEME`, `generateSnippet`, `copyContent`, core types | Ported to Octane. |
| `@octanejs/grab/primitives` | `copyContent`, `disposeBaselineStyles`, `freeze`, `unfreeze`, `isFreezeActive`, `openFile`, `isElementGrabbable`, `getElementBounds`, `getElementSelector`, `getElementContext`, `getElementAtPoint`, `getElementsAtPoint`, `getElementsAtPosition`, `OpenFileError`, `FreezeError`, `ReactGrabElementContext`, primitive types | Ported to Octane. |
| `@octanejs/grab/styles.css` | Overlay stylesheet | Ported; not a JS module. |

## Source boundary

`src/` mirrors upstream `packages/react-grab/src/` file-for-file; `.tsx` components are authored `.tsrx`. The fiber-introspection dependency `bippy` is reimplemented in clean room as `src/bippy/` (`index.ts`, `octane-hook.ts`, `source.ts`) over Octane scope instrumentation rather than React fibers; `src/reactive.ts` is the Octane-authored reactive bridge, and `src/custom.d.ts` carries the shipped `*?raw` ambient declaration. Upstream `core/index.tsx` is `src/core/index.ts`. `audit/closure.json` records the complete shipped-source ledger with per-file hashes and the adapted/authored boundary.

## Upstream test crosswalk

`audit/registrations.json` preserves all 1525 immutable upstream registrations across 110 test files. `audit/crosswalk.json` classifies every registration:

- `implemented` (356): the upstream Vitest unit suite, materialized byte-exact under `tests/upstream/` with mechanical import rewrites and executed by the adapted lane (`grab` project). The same files run pristine under the `grab-pristine` project via a `vite-plus/test`→`vitest` alias.
- `conformance` (539): upstream Playwright/e2e contracts verified by package-local evidence (adapted unit tests, the authored Chromium browser lane, differential and SSR tests).
- `unsupported` (575): upstream Playwright scenarios bound to `apps/e2e-app-*` fixture applications and the expect-sdk harness, which live outside the pinned `packages/react-grab` subtree; each entry records the durable rationale.
- `inapplicable` (55): registrations asserting mechanisms outside this binding's surface (React owner-chain semantics, framework-router recovery, production-build fixtures, AI-evaluated expect-sdk cases).

Upstream has no type-test suite; `upstreamSuites.types` is `absent` in `audit/react-parity.json`, and both type lanes carry repo-authored evidence.
