# `@octanejs/dnd-kit-accessibility` upstream ledger

`@octanejs/dnd-kit-accessibility` ports `@dnd-kit/accessibility@3.1.1` from
`https://github.com/clauderic/dnd-kit.git`, the legacy dnd kit API.

## Pin

- Package: `@dnd-kit/accessibility@3.1.1`, the latest release.
- Source commit: `e9215e820798459ae036896fce7fd9a6fe855772`, the `@dnd-kit/core@6.3.1` release tag. It holds all
  five legacy packages at their latest releases. Their trees there are
  byte-identical to their own release tags; this package's tag is
  `@dnd-kit/accessibility@3.1.1` at `2ed036393f80066423545acfe1b394ca0822c1fe`.
- npm integrity: `sha512-2P+YgaXF+gRsIihwwY1gCsQSYnu9Zyj2py8kY5fFvUM1qm2WA2u639R6YNVfU4GWr+ZM5mqEsfHZZLoRONbemw==`
- npm tarball SHA-256: `5c4e4168454bc38e0ae6d95b00931bad8a4eda487760e36460217387a0b31450`
- License: MIT. `LICENSE.upstream` is the upstream package's license, byte for byte.
- React oracle: `react@19.2.7` and `react-dom@19.2.7` from the default catalog.

The legacy packages were published without a `gitHead` or npm provenance, so the
repository's preflight cannot tie the npm artifact to a commit on its own. The
source is pinned to the release tag instead, and the parity status stays
`recorded-unverified`.

`upstream/` holds the pinned package directory byte for byte. Each file
is checked against its git blob SHA in `audit/upstream.lock.json`:

```sh
pnpm react-port:materialize run --check --package-dir packages/dnd-kit-accessibility
```

## Source boundary

`src/` mirrors `upstream/src/` file for file, formatted with the repository's
Prettier settings, with `react`/`react-dom` imports pointed at `octane` and
`@dnd-kit/*` imports pointed at the `@octanejs/dnd-kit-*` packages. Files that
change beyond that:

- `components/HiddenText/HiddenText.tsx`, `components/LiveRegion/LiveRegion.tsx`: the `React.CSSProperties` type comes from `octane`, and the files carry the Octane JSX pragma.

## Public surface

Every runtime export of `@dnd-kit/accessibility@3.1.1` is ported under the same name: `HiddenText`, `LiveRegion`, and `useAnnouncement`.
`tests/exports.test.ts` compares the export names and value kinds with the published
package, and `typetests/public-api.test-d.ts` checks the public types.

## Tests

| Upstream | Disposition |
| --- | --- |
| `test/accessibility.test.tsx (1 placeholder case)` | Runs unchanged against the pinned source and React (`dnd-kit-accessibility-pristine`), and regenerated from the lock against the port (`dnd-kit-accessibility-upstream`). |
| Repository Cypress specs (`cypress/integration/draggable_spec.ts`, `sortable_spec.ts`) | Not ported. They drive the Storybook stories outside the package boundary. The differential below covers the same pointer and keyboard drags against the published package. |

Because the upstream unit tests are placeholders, the behavioral contract is the
repo-authored differential: `tests/differential/parity.test.ts` (both live-region politeness levels, the hidden instructions, and announce/ignore/clear). `audit/react-parity.json` registers all three
lanes; `node scripts/react-parity/dnd-kit-legacy-manifest.mjs` regenerates it and
the runtime inventories.
