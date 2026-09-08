# react-resizable-panels upstream contract

## Pin and source boundary

| Field | Value |
|---|---|
| Package | `react-resizable-panels` |
| Version | `4.12.2` |
| Canonical repository | `https://github.com/bvaughn/react-resizable-panels.git` |
| Canonical tag commit | `a1eeb7aefdb024bb5879a323218e0ac05f77f28e` |
| Supported upstream range | exactly `4.12.2` |
| npm tarball SHA-256 | `099742808fafbe3a0288d758271aaf1c35dc9b66ec85077e60f0861e58e89e61` |
| License | MIT, copyright Brian Vaughn |

`upstream/` contains the byte-exact canonical `lib/` source and tests plus
the package, TypeScript, and Vitest metadata needed to execute them.
`upstream-artifact/` contains the complete unpacked npm publication artifact. Both
boundaries are development evidence and excluded from the published `files`.
`audit/upstream.lock.json` pins every committed Git-sourced byte to the canonical
commit's Git blob identity; registry-only artifact bytes remain separately
hash-checked by the package verifier.

The adapted suite under `tests/upstream/` is regenerated from the lock's
mechanical rewrites plus minimal patches in `audit/upstream-patches/`; it is not
committed.

Run `pnpm --dir packages/resizable-panels upstream:verify` to reject a
modified, missing, or extra vendored file and drift in the export, type, or test
inventories. The verifier's negative-control mode proves each fail-closed path.

## Public runtime export crosswalk

The binding exports the exact pinned runtime set: `Group`, `Panel`, `Separator`,
`isCoarsePointer`, `useDefaultLayout`, `useGroupCallbackRef`, `useGroupRef`,
`usePanelCallbackRef`, and `usePanelRef`. Their authoritative source modules and
exact names are recorded in `audit/public-api.json`.

## Public type crosswalk

All 13 public types are implemented and checked against the pinned declaration:
`GroupImperativeHandle`, `GroupProps`, `Layout`, `LayoutChangedMeta`,
`LayoutStorage`, `OnGroupLayoutChange`, `Orientation`, `OnPanelResize`,
`PanelImperativeHandle`, `PanelProps`, `PanelSize`, `SizeUnit`, and
`SeparatorProps`.

The npm declaration imports React's node, intrinsic attribute, CSS, ref,
dispatch/set-state, and JSX result types. `audit/type-expressibility.json` and
`audit/type-probes/` preserve equal strictness by deriving host attributes, CSS,
events, and refs from Octane's existing strict JSX intrinsic surface. Octane's
type declarations intentionally derive that surface from React types, and
`@types/react` is a normal dependency of `octane`; this type-only lineage is
acceptable. The binding itself has no React runtime dependency and no required
React or ReactDOM peer. It must not replace the intrinsic surface with a
hand-written or `any`-based map.

## Upstream test disposition

The canonical `lib/` tree contains the exact 29 test artifacts and 329 literal
registrations enumerated in `audit/test-inventory.json`. Every artifact is
adapted and executable; parameter matrices expand the adapted lane beyond the
literal registration count. Port-authored differential, persistence, SSR,
hydration, type, and real-browser evidence is inventoried separately. Negative
controls reject missing or renamed tests, stale classifications, and API or
provenance drift.
