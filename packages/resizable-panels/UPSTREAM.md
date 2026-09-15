# react-resizable-panels upstream contract

## Source boundary

| Field | Value |
|---|---|
| Package | `react-resizable-panels` |
| Version | `4.12.4` |
| Canonical repository | `https://github.com/bvaughn/react-resizable-panels.git` |
| Canonical tag commit | `152b1a8f856438c432b360a77a5afbdeb78782fb` |
| Supported upstream range | exactly `4.12.4` |
| npm tarball SHA-256 | `d6374b89cbce9a0f224f0f776642362de515a308df75bd23eb33e6fef23d2ab7` |
| License | MIT, copyright Brian Vaughn |

`upstream/` contains the byte-exact canonical `lib/` source and tests plus
the pinned browser driver/runtime fixtures and the package, TypeScript, and Vitest metadata needed to execute them.
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

The pinned source contains **505 registrations across 41 test artifacts**:
439 unit cases in 31 files and 66 browser scenarios in 10 files. All 439 unit
cases execute against both React and Octane. The 63 decoder browser scenarios
run unchanged assertions in both ordinary and popup Chromium windows, yielding
126 checks per runtime. `audit/registrations.json` preserves every immutable
registration and `audit/crosswalk.json` accounts for each one.

Two upstream default-layout scenarios depend on separate demo application
servers. Octane conformance tests cover the same persistence and layout-stability
contracts for client startup and SSR hydration, including actual layout-shift
measurements and server DOM adoption. The remaining demo scenario requires React
Server Components, which Octane does not support; it is explicitly inapplicable.
These three dispositions are recorded in `audit/browser-dispositions.json`.

The public type checks cover all 22 exports. Custom hooks retain Octane's optional
compiler-assigned trailing symbol parameter. `Layout` preserves the upstream
string index signature, including numeric property access. Negative controls
reject missing assertions, altered helper bodies, changed pinned bytes, and
undeclared browser fixture adaptations.

Browser drivers and serialization helpers execute with their pristine React toolchain. Only the browser runtime components and decoder are adapted to Octane; their renderable and class-name types are checked by `tsconfig.fixtures.json`.
