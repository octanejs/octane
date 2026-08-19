# Upstream provenance

`@octanejs/popper` ports the React binding from
[`react-popper@2.3.0`](https://github.com/floating-ui/react-popper/releases/tag/v2.3.0)
while reusing `@popperjs/core` unchanged.

## Immutable pin

- Package: `react-popper@2.3.0`
- Repository: `https://github.com/floating-ui/react-popper`
- Tag: `v2.3.0`
- Commit: `b636fa3ceee14245d670a0c438fe4343c31258e5`
- License: MIT
- Supported upstream range: exactly `2.3.0`
- React oracle: `react@19.2.7` and `react-dom@19.2.7`
- Type oracle: `@types/react@19.2.17` and `@types/react-dom@19.2.3`
- Pristine Jest peer aliases: `react@18.3.1` / `react-dom@18.3.1` (upstream peer is React 16–18)

The pinned tag source, test suites, snapshots, TypeScript programs, package
metadata, README, and license are vendored under `upstream/tag`. The published
npm declaration, package metadata, README, and license are vendored under
`upstream/npm`. `audit/upstream-inventory.json` records their SHA-256 hashes and
the parity audit fails closed when either authority or its case map changes.

Oracle versions above are the resolved lockfile pins used by the pristine and
adapted lanes. They must not silently track `catalog:default` drift; bump them
here and in the lockfile together when the port upgrades its React oracle.

## Host tooling adaptation

The three Jest snapshot files under `upstream/tag/src/__snapshots__/` keep the
pinned v2.3.0 bodies but use the current Jest snapshot guide URL
(`https://jestjs.io/docs/snapshot-testing`) instead of the legacy `goo.gl`
header. Jest 30 rejects the outdated header; the inventory checksums cover the
adapted files.

## Export crosswalk

| Upstream entry point or export | Octane disposition | Evidence |
| --- | --- | --- |
| `Manager` | Ported | Adapted `tests/upstream/Manager.test.tsx`; differential and public runtime suites. |
| `Reference` | Ported | Adapted `tests/upstream/Reference.test.tsx` (direct setter-context provider fixture). |
| `Popper` | Ported | Adapted `tests/upstream/Popper.test.tsx`; differential markup/placement cases. |
| `usePopper` | Ported | Adapted `tests/upstream/usePopper.test.tsx`. |
| `ManagerProps` | Ported | Public type contract (`typetests/public-api.test.ts`, ordinary package typecheck) and adapted typings programs. |
| `ReferenceProps` / `ReferenceChildrenProps` | Ported | Public type contract and adapted typings programs. |
| `PopperProps` / `PopperChildrenProps` / `PopperArrowProps` | Ported | Public type contract and adapted typings programs. |
| `RefHandler` | Ported | Public type contract. |
| `Modifier` / `StrictModifier` | Ported | Public type contract (`@ts-expect-error` negative controls for invalid options). |
| `ManagerReferenceNodeSetterContext` (private) | Ported for adapted tests | Re-exported from `src/components.tsrx` for upstream Reference fixtures; not part of the published `index.ts` surface. |
| `@popperjs/core` | Reused unchanged | Peer dependency; positioning behavior comes from the pinned core. |

## Upstream suite disposition

| Pinned artifact | Disposition | Local evidence |
| --- | --- | --- |
| `tag/src/Manager.test.js` | Adapted | `tests/upstream/Manager.test.tsx` |
| `tag/src/Reference.test.js` | Adapted | `tests/upstream/Reference.test.tsx` |
| `tag/src/Popper.test.js` | Adapted | `tests/upstream/Popper.test.tsx` |
| `tag/src/usePopper.test.js` | Adapted | `tests/upstream/usePopper.test.tsx` |
| `tag/src/__snapshots__/*.snap` | Host-tooling adapted | Inventory-checksummed snapshot bodies with Jest 30 header URL. |
| `tag/typings/tests/main-test.tsx` | Pristine + adapted | Pristine lane via `tsc`; adapted `typetests/main-test.tsx` via `tsrx-tsc`; structural type-parity ledger. |
| `tag/typings/tests/svg-test.tsx` | Pristine + adapted | Pristine lane via `tsc`; adapted `typetests/svg-test.tsx` via `tsrx-tsc`; structural type-parity ledger. |
| Flow typings under `tag/src/__typings__` | Out of scope | Octane publishes TypeScript; Flow programs are not part of the Octane binding contract. |

Port-authored test classifications (adapted upstream, differential, Octane-only)
live in `audit/test-classifications.json` and are verified by
`scripts/react-parity/popper-classifications-lib.mjs`.
