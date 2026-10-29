# `@octanejs/dnd-kit-utilities` upstream ledger

`@octanejs/dnd-kit-utilities` ports `@dnd-kit/utilities@3.2.2` from
`https://github.com/clauderic/dnd-kit.git`, the legacy dnd kit API.

## Pin

- Package: `@dnd-kit/utilities@3.2.2`, the latest release.
- Source commit: `e9215e820798459ae036896fce7fd9a6fe855772`, the `@dnd-kit/core@6.3.1` release tag. It holds all
  five legacy packages at their latest releases. Their trees there are
  byte-identical to their own release tags; this package's tag is
  `@dnd-kit/utilities@3.2.2` at `694dcc2f62e5269541fc941fa6c9af46ccd682ad`.
- npm integrity: `sha512-+MKAJEOfaBe5SmV6t34p80MMKhjvUz0vRrvVJbPT0WElzaOJ/1xs+D+KDv+tD/NE5ujfrChEcshd4fLn0wpiqg==`
- npm tarball SHA-256: `048c7f56d17ceae19a29979700582566c0036600ee4d2c38ba13e9e8f906a18e`
- License: MIT. `LICENSE.upstream` is the upstream package's license, byte for byte.
- React oracle: `react@19.2.7` and `react-dom@19.2.7` from the default catalog.

The legacy packages were published without a `gitHead` or npm provenance, so the
repository's preflight cannot tie the npm artifact to a commit on its own. The
source is pinned to the release tag instead, and the parity status stays
`recorded-unverified`.

`upstream/` holds the pinned package directory byte for byte. Each file
is checked against its git blob SHA in `audit/upstream.lock.json`:

```sh
pnpm react-port:materialize run --check --package-dir packages/dnd-kit-utilities
```

## Source boundary

`src/` mirrors `upstream/src/` file for file, formatted with the repository's
Prettier settings, with `react`/`react-dom` imports pointed at `octane` and
`@dnd-kit/*` imports pointed at the `@octanejs/dnd-kit-*` packages. Files that
change beyond that:

- Every module is copied from `upstream/src/` with its React import pointed at `octane`; no file has a behavioral change.

## Public surface

Every runtime export of `@dnd-kit/utilities@3.2.2` is ported under the same name: hooks, `CSS`, coordinate math, event and node type guards, `canUseDOM`, `getWindow`, `getOwnerDocument`, `findFirstFocusableNode`, and the `Arguments`/`DeepRequired`/`FirstArgument`/`Without`/`Coordinates`/`Transform`/`Transition` types.
`tests/exports.test.ts` compares the export names and value kinds with the published
package, and `typetests/public-api.test-d.ts` checks the public types.

## Tests

| Upstream | Disposition |
| --- | --- |
| `src/test/utilities.test.ts (1 placeholder case)` | Runs unchanged against the pinned source and React (`dnd-kit-utilities-pristine`), and regenerated from the lock against the port (`dnd-kit-utilities-upstream`). |
| Repository Cypress specs (`cypress/integration/draggable_spec.ts`, `sortable_spec.ts`) | Not ported. They drive the Storybook stories outside the package boundary. The differential below covers the same pointer and keyboard drags against the published package. |

Because the upstream unit tests are placeholders, the behavioral contract is the
repo-authored differential: `tests/differential/helpers.test.ts` (every framework-free helper against the published package) and `tests/differential/parity.test.ts` (every hook through one fixture: values, ref callbacks, layout effects). `audit/react-parity.json` registers all three
lanes; `node scripts/react-parity/dnd-kit-legacy-manifest.mjs` regenerates it and
the runtime inventories.
