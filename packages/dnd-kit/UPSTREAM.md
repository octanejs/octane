# dnd-kit React upstream ledger

`@octanejs/dnd-kit` targets `@dnd-kit/react@0.5.0` from
`https://github.com/clauderic/dnd-kit.git`.

## Immutable pin

- Package: `@dnd-kit/react@0.5.0`
- Tag: `@dnd-kit/react@0.5.0`
- Commit and npm `gitHead`: `cc98bdd52c06e55221e8cf77aaa0c2ec0f55b86f`
- npm archive SHA-256: `33ce0c6b148117ab4568669492cd8187e8d04f3d1125cd26c598d9110a14e75e`
- npm lock integrity: `sha512-abQPLI8lmfVE+v/n+pqy5WFxrw6T2Yg0UQZsL78dp5DKci7dKTVDjvLWqvass+XTFtzJmsZEjk1NdqE6xG8Jiw==`
- Supported range: exactly `0.5.0`
- License: MIT
- React oracle: exact `react@19.2.7` and `react-dom@19.2.7` via catalog `dnd-kit-react-oracle`
- Framework-neutral core: the workspace-pinned `@dnd-kit/{abstract,collision,dom,state}` 0.5.0 packages

The byte-exact React adapter source, package/build metadata, and license are vendored under
`upstream/`; `SHA256SUMS` authenticates all 31 files. The canonical package directory at this pin
contains no runtime test files, fixtures, snapshots, or dedicated type assertion suite. This is a
repository-tree observation, not an inference from the published archive.

## Public surface crosswalk

| Entry point | Octane disposition | Evidence or gap |
| --- | --- | --- |
| `.` | Surface present, unverified | Runtime export contract plus one bounded programmatic manager-action differential; pointer, keyboard-sensor, layout, and browser lifecycle coverage is not exhaustive. |
| `./hooks` | Surface present, unverified | Runtime export contract and Octane hook conformance tests. |
| `./sortable` | Surface present, unverified | Runtime export contract and Octane sortable lifecycle tests. |
| `./utilities` | Surface present, unverified | Runtime export contract and `currentValue` conformance tests. |

The local `typetests/public-api.test-d.ts` checks the Octane declaration surface but is not a
pristine/adapted upstream type pair because upstream publishes no dedicated type-test suite.

## Executable evidence and gaps

The repo-authored differential runs one identical `.tsrx` programmatic manager-action lifecycle
against both adapters (empty sensors; start/move/stop via `manager.actions`) and compares mount,
pickup, movement, overlay, and drop output. Audit contracts authenticate the
pin and keep the two known adaptations explicit: compiled-child handling in `DragOverlay`, and
omission of the default optimistic sorting plugin because it can split renderer-owned keyed ranges.
The binding remains `recorded-unverified`; jsdom equality is not evidence for real pointer geometry,
observers, or every browser drag lifecycle.
