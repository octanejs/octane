# Upstream react-draggable audit

This binding targets exactly `react-draggable@4.7.1`. It does not claim a
floating compatibility range.

- repository: `https://github.com/react-grid-layout/react-draggable.git`
- annotated tag: `v4.7.1`
- tag object: `cec7498ff84e91215987636d3edbb6ca132ee9e5`
- tag commit: `bcbaa8eb285aea49865ca8870c0b7b441c2fe6a4`
- commit tree: `7b17a5d02449287945f87dee0cecdadcfb56cdc5`
- npm integrity: `sha512-wa3tzfFnYt3yaZLuyU58fl1TNunfWfBekDgWhZA1+gb2jnp42wZ0ymuopR6M5kqDYmm4hKmzGlcKWjZf3Zb6RQ==`
- npm tarball SHA-1: `e502c3cfe0cc97d691e12aaa377a975fce097d71`
- license: MIT
- React oracle: `react@19.2.7` / `react-dom@19.2.7`
- React type oracle: `@types/react@19.2.17` / `@types/react-dom@19.2.3`
- oracle catalog: `catalog:react-draggable-react-oracle` (immutable pin; not
  `catalog:default`)

The npm tarball is the consumer authority for runtime bytes, declarations,
exports, and package conditions. The annotated Git tag is the source, test,
fixture, and license authority. The tag object resolves directly to the commit
above. [`audit/artifact-authorities.json`](./audit/artifact-authorities.json)
records every npm/tag boundary discrepancy and its disposition. Oracle versions
are also recorded under `release.oracleVersions` in
[`audit/upstream-inventory.json`](./audit/upstream-inventory.json).

## Vendored boundary

`upstream/npm/` is the complete unpacked npm artifact: all 26 published files,
including the exact CJS/ESM runtime, declaration files, source maps, web build,
metadata, README, changelog, and license. `upstream/tag/` contains the relevant
byte-exact repository boundary: all ten `lib/` source modules; all `test/`
files and fixtures; the `typings/` consumer program; package metadata; compiler,
build, and Vitest configuration; and the license.

Vendored evidence is development-only. The binding's `files` allowlist excludes
`upstream/`, `audit/`, and `tests/audit/`.

## Public surface

The pinned root runtime exports default `Draggable` and named
`DraggableCore`. Its eight public type exports are `ControlPosition`,
`DraggableBounds`, `DraggableCoreProps`, `DraggableData`, `DraggableEvent`,
`DraggableEventHandler`, `DraggableProps`, and
`PositionOffsetControlPosition`. The only package subpaths are `.` and
`./package.json`.

The generated declaration also contains private bundle types and an internal
`DraggableDefaultProps` export from the non-public `Draggable` chunk. Those are
not root exports and therefore are not consumer surface. The root declaration,
not the source module's convenience exports, is authoritative.

## Exhaustive work list

[`audit/upstream-inventory.json`](./audit/upstream-inventory.json) is the
machine-readable crosswalk. It hashes every vendored artifact and gives exactly
one disposition to every source module, public runtime export, public type
export, unit/type case, browser case, fixture, and type assertion.

The pinned repository contains exactly 204 non-browser unit/type cases across
11 test files and 23 browser cases. The type-compatibility fixture contains
explicit `expectType` assertions plus children/JSX/class probes. Test identities
include file, source line, and title so same-titled cases in different
`describe` blocks remain distinct.

Adapted public unit and browser cases live in
`tests/upstream/public-root.test.ts` and `tests/browser/parity.browser.test.ts`.
Each `adaptedCase(identity, …)` identity is the upstream citation
(`tag/test/…::title`). The audit inventories every adapted callback's
assertions, scenario steps, and fixture refs (`inventories.adaptedCaseStructures`)
and every corresponding upstream case structure
(`inventories.upstreamCaseStructures`). Deleting or weakening an adapted
`expect(...)` while keeping the title fails closed.

Type parity is governed by [`audit/type-parity.json`](./audit/type-parity.json)
with file/assertion-group inventories in `audit/pristine-types.json` and
`audit/adapted-types.json`. React-only children/JSX/`React.Component` probes are
recorded as `upstreamOnlyAssertionGroups`; adapted `@ts-expect-error` controls
are required.

Every authored package test is classified in
[`audit/test-classifications.json`](./audit/test-classifications.json). Discovery
and the classification ledger must be equal and disjoint.

`node audit/upstream-inventory.mjs` recomputes file hashes, identities, and case
structures from the vendored/adapted bytes, verifies the crosswalk is bijective,
rejects duplicate or skip dispositions, checks the exact public subpaths,
verifies oracle catalog pins, and verifies the root MIT notice.
`node --test tests/audit/upstream-inventory.test.mjs` proves failures for a
missing/renamed source, renamed unit case, removed browser case, removed type
assertion, deleted adapted assertion body, removed `@ts-expect-error`,
unclassified authored test, duplicate disposition, invented export, invented
subpath, skip disposition, and stale fixture hash.

## Allowed transforms

Source and type adaptations are fail-closed behind an explicit ledger. The
current `allowedTransforms` entries are:

| id | Applies to | Authorization |
|---|---|---|
| `import-root-octanejs` | adapted runtime + types | Rewrite `react-draggable` imports to `@octanejs/react-draggable` |
| `native-events` | adapted types | Replace React synthetic `MouseEvent`/`TouchEvent` unions with native events |
| `function-components` | adapted types | Replace `React.Component` class assignability with Octane function-component types |
| `nodeRef-prop-surface` | adapted runtime + types | Express consumer refs through Octane `nodeRef` props rather than class-component refs |

Type-lane detail and upstream-only probe dispositions live in
`audit/type-parity.json` `permittedTransformations` /
`upstreamOnlyAssertionGroups`.

## License provenance

React Draggable is MIT licensed, Copyright 2014–2016 Matt D. Smith and
Copyright 2016–Present STRML. [`LICENSE`](./LICENSE) is byte-identical to both
the pinned tag and published npm notice and accompanies this binding.
