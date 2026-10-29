# `@octanejs/dnd-kit-modifiers` upstream ledger

`@octanejs/dnd-kit-modifiers` ports `@dnd-kit/modifiers@9.0.0` from
`https://github.com/clauderic/dnd-kit.git`, the legacy dnd kit API.

## Pin

- Package: `@dnd-kit/modifiers@9.0.0`, the latest release.
- Source commit: `e9215e820798459ae036896fce7fd9a6fe855772`, the `@dnd-kit/core@6.3.1` release tag. It holds all
  five legacy packages at their latest releases. Their trees there are
  byte-identical to their own release tags; this package's tag is
  `@dnd-kit/modifiers@9.0.0` at `2d862922975e5fa73e1a11845f8c781296f21d4b`.
- npm integrity: `sha512-ybiLc66qRGuZoC20wdSSG6pDXFikui/dCNGthxv4Ndy8ylErY0N3KVxY2bgo7AWwIbxDmXDg3ylAFmnrjcbVvw==`
- npm tarball SHA-256: `1ad2f9ecf7b65bd58de367c7b9226b62951916ca2694ad66440a3c8978ebdc29`
- License: MIT. `LICENSE.upstream` is the upstream package's license, byte for byte.
- React oracle: `react@19.2.7` and `react-dom@19.2.7` from the default catalog.

The legacy packages were published without a `gitHead` or npm provenance, so the
repository's preflight cannot tie the npm artifact to a commit on its own. The
source is pinned to the release tag instead, and the parity status stays
`recorded-unverified`.

`upstream/` holds the pinned package directory byte for byte. Each file
is checked against its git blob SHA in `audit/upstream.lock.json`:

```sh
pnpm react-port:materialize run --check --package-dir packages/dnd-kit-modifiers
```

## Source boundary

`src/` mirrors `upstream/src/` file for file, formatted with the repository's
Prettier settings, with `react`/`react-dom` imports pointed at `octane` and
`@dnd-kit/*` imports pointed at the `@octanejs/dnd-kit-*` packages. Files that
change beyond that:

- Every module is copied from `upstream/src/` with its `@dnd-kit/*` imports pointed at the Octane packages; no file has a behavioral change.

## Public surface

Every runtime export of `@dnd-kit/modifiers@9.0.0` is ported under the same name: `createSnapModifier`, the five `restrictTo*` modifiers, and `snapCenterToCursor`.
`tests/exports.test.ts` compares the export names and value kinds with the published
package, and `typetests/public-api.test-d.ts` checks the public types.

## Tests

| Upstream | Disposition |
| --- | --- |
| `test/modifiers.test.tsx (2 cases: `restrictToHorizontalAxis`, `restrictToVerticalAxis`)` | Runs unchanged against the pinned source and React (`dnd-kit-modifiers-pristine`), and regenerated from the lock against the port (`dnd-kit-modifiers-upstream`). |
| Repository Cypress specs (`cypress/integration/draggable_spec.ts`, `sortable_spec.ts`) | Not ported. They drive the Storybook stories outside the package boundary. The differential below covers the same pointer and keyboard drags against the published package. |

Because the upstream unit tests are placeholders, the behavioral contract is the
repo-authored differential: `tests/differential/parity.test.ts` (horizontal axis with the first scrollable ancestor, vertical axis with the parent element, window edges, a snap grid, and DragOverlay modifiers). `audit/react-parity.json` registers all three
lanes; `node scripts/react-parity/dnd-kit-legacy-manifest.mjs` regenerates it and
the runtime inventories.
