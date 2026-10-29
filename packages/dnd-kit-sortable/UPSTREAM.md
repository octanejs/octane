# `@octanejs/dnd-kit-sortable` upstream ledger

`@octanejs/dnd-kit-sortable` ports `@dnd-kit/sortable@10.0.0` from
`https://github.com/clauderic/dnd-kit.git`, the legacy dnd kit API.

## Pin

- Package: `@dnd-kit/sortable@10.0.0`, the latest release.
- Source commit: `e9215e820798459ae036896fce7fd9a6fe855772`, the `@dnd-kit/core@6.3.1` release tag. It holds all
  five legacy packages at their latest releases. Their trees there are
  byte-identical to their own release tags; this package's tag is
  `@dnd-kit/sortable@10.0.0` at `2d862922975e5fa73e1a11845f8c781296f21d4b`.
- npm integrity: `sha512-+xqhmIIzvAYMGfBYYnbKuNicfSsk4RksY2XdmJhT+HAC01nix6fHCztU68jooFiMUB01Ky3F0FyOvhG/BZrWkg==`
- npm tarball SHA-256: `07d017cb1e84bfad0687c5415594cb3e4a8045cc7edfa9066cadda5e5323f604`
- License: MIT. `LICENSE.upstream` is the upstream package's license, byte for byte.
- React oracle: `react@19.2.7` and `react-dom@19.2.7` from the default catalog.

The legacy packages were published without a `gitHead` or npm provenance, so the
repository's preflight cannot tie the npm artifact to a commit on its own. The
source is pinned to the release tag instead, and the parity status stays
`recorded-unverified`.

`upstream/` holds the pinned package directory byte for byte. Each file
is checked against its git blob SHA in `audit/upstream.lock.json`:

```sh
pnpm react-port:materialize run --check --package-dir packages/dnd-kit-sortable
```

## Source boundary

`src/` mirrors `upstream/src/` file for file, formatted with the repository's
Prettier settings, with `react`/`react-dom` imports pointed at `octane` and
`@dnd-kit/*` imports pointed at the `@octanejs/dnd-kit-*` packages. Files that
change beyond that:

- `components/SortableContext.tsx`: `createContext` from `octane`, rendered as `<Context value>`.
- `hooks/utilities/useDerivedTransform.ts`: the `MutableRefObject` type comes from `octane`.

## Public surface

Every runtime export of `@dnd-kit/sortable@10.0.0` is ported under the same name: `SortableContext`, `useSortable`, `defaultAnimateLayoutChanges`, `defaultNewIndexGetter`, the four strategies, `sortableKeyboardCoordinates`, `arrayMove`, `arraySwap`, `hasSortableData`, and every public type.
`tests/exports.test.ts` compares the export names and value kinds with the published
package, and `typetests/public-api.test-d.ts` checks the public types.

## Tests

| Upstream | Disposition |
| --- | --- |
| `test/sortable.test.tsx (1 placeholder case)` | Runs unchanged against the pinned source and React (`dnd-kit-sortable-pristine`), and regenerated from the lock against the port (`dnd-kit-sortable-upstream`). |
| Repository Cypress specs (`cypress/integration/draggable_spec.ts`, `sortable_spec.ts`) | Not ported. They drive the Storybook stories outside the package boundary. The differential below covers the same pointer and keyboard drags against the published package. |

Because the upstream unit tests are placeholders, the behavioral contract is the
repo-authored differential: `tests/differential/parity.test.ts` (a keyboard reorder of a vertical list, a keyboard cancel, and a pointer reorder of horizontal tabs past a distance constraint). `audit/react-parity.json` registers all three
lanes; `node scripts/react-parity/dnd-kit-legacy-manifest.mjs` regenerates it and
the runtime inventories.
