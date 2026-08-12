# dexie-react-hooks upstream ledger

## Pin

- Package: `dexie-react-hooks@4.4.0`
- Repository: `https://github.com/dexie/Dexie.js.git`
- Release tag: `v4.4.0`
- Annotated tag object: `bcc41ae3ec1a74b403e02494058ac90893a3041b`
- Commit: `207608ae3214e8cc1a0c0dca394a94b9646e66b2`
- npm tarball SHA-256: `0bc97caee264afe677503af0d692b97e9bedbbf58e5bfc80b3446f687b165f30`
- License: Apache-2.0
- React oracle: workspace React 19.2.7

The binding reuses Dexie's IndexedDB core and ports every public dexie-react-hooks hook onto Octane.

## Export crosswalk

`useObservable`, `useLiveQuery`, `useSuspendingObservable`, `useSuspendingLiveQuery`, `usePermissions`, and `useDocument` are all exported and covered by the package conformance/type suites. Dexie's framework-neutral exports are re-exported from the package root. `useDocument` retains the upstream optional `y-dexie`/`yjs` integration boundary.

## Test-suite disposition

The canonical package has one Karma/QUnit browser integration suite with four IndexedDB scenarios and TypeScript compilation over its source/tests. All four runtime scenarios are adapted and execute in real Chromium against the Octane binding. A same-fixture differential additionally runs `useLiveQuery` against real dexie-react-hooks and Octane over one fake-indexeddb database, including an affected write. SSR and hydration are Octane-specific contracts; the adapted type lane compiles the complete supported public surface.
