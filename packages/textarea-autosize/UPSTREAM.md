# textarea-autosize upstream evidence

- Package: `react-textarea-autosize@8.5.9`
- npm tarball SHA-1: `ab8627b09aa04d8a2f45d5b5cd94c84d1d4a8893`
- npm tarball SHA-256: `648a3eae6d4a8708e215b7272907ba018b5f77430acbb568a2c5aebd238ce945`
- npm integrity: `sha512-U1DGlIQN5AwgjTyOEnI1oCcMuEr1pv1qOtklB2l4nyMGbHzWrI0eFsYK0zos2YWqAolJyG0IWJaqWmWj5ETh0A==`
- Source commit: `ed1894cd8611d99fbea1c47adcf6ee522b1030fd`
- License: MIT, copyright 2013 Andrey Popp
- React oracle: `react@19.2.7`, `react-dom@19.2.7`, `@types/react@19.2.17`, and `@types/react-dom@19.2.3` via catalog `react-textarea-autosize-react-oracle` (exact pins; not `catalog:default`)
- Published declarations oracle: `upstream-artifact/dist/declarations/src/index.d.ts` (sha256 `4b44a78900c844368d8f27ce485bb55bd17ba164cb31e3b8bbc64c6800da506c`), extracted byte-exact from the pinned npm tarball for the pristine type lane

The npm artifact supplies the published distribution and package-condition boundary; its
byte-pinned evidence (tarball and artifact declarations) lives under `upstream-artifact/`. The exact repository commit supplies the source and two upstream Jest
artifacts absent from the tarball, vendored under `upstream/` and pinned by
`audit/upstream.lock.json`: each committed file verifies offline against its upstream git blob
sha (`pnpm react-port:materialize run --check --package-dir packages/textarea-autosize`). The
upstream MIT license is retained byte-exact as `LICENSE.upstream`, hash-matched to the lock.
Both evidence trees are excluded from publication.

## Public surface crosswalk

| Upstream surface | Octane surface | Status | Evidence |
| --- | --- | --- | --- |
| default `TextareaAutosize` | default `TextareaAutosize` | Ported | runtime, SSR, hydration, and browser lanes |
| `TextareaAutosizeProps` | `TextareaAutosizeProps` | Ported with native event types | paired type lanes |
| `TextareaHeightChangeMeta` | `TextareaHeightChangeMeta` | Ported | paired type lanes |
| root conditional exports | root source export with matching conditions | Ported | packed resolver matrix |
| `./package.json` | `./package.json` | Ported | packed resolver matrix |

## Test disposition

| Upstream artifact | Disposition |
| --- | --- |
| `src/__tests__/index.test.js` | Run pristine with React and adapted case-for-case under `tests/upstream/` |
| `src/__tests__/__snapshots__/index.test.js.snap` | Retained pristine; equivalent adapted DOM assertions avoid framework snapshot internals |

Port-authored runtime and type tests are classified fail-closed in `audit/test-classifications.json`. The pristine→adapted case map and negative controls live in `audit/upstream-crosswalk.json` and `scripts/react-parity/react-textarea-autosize-controls.test.mjs`. Paired type evidence is recorded in `audit/type-parity.json` with assertion-group inventories.

The public callback remains named `onChange`, but Octane supplies a native input event rather than a React SyntheticEvent. The binding guarantees per-edit timing, target/currentTarget value during dispatch, bubbling, cancellation, and callback ordering. React-only event identity and fields are documented divergences.
