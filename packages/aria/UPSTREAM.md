# React Aria upstream ledger

`@octanejs/aria` targets the coordinated React Spectrum release at commit
`5ecb3333001313e83898cd07644227897e3bae1f`:

| Package | Version | npm SHA-256 | npm integrity |
| --- | --- | --- | --- |
| `react-aria` | `3.51.0` | `8d404cc6c43909f85dcd207435614db08f38c69553b8085bed2910c61b7e89fa` | `sha512-AyWLw0XR38cFPwBu/ErgGaVrc5dupLEKmRlMXTGvFKOtbaGRQ2+yQJkjVhpdHhoRhU4+G+tJDFeHDTS8tK3bfQ==` |
| `react-aria-components` | `1.20.0` | `b63f044f9cb25cb48789b8c2ce06b27c83a81c94c6413a29766eabb3c15458dd` | `sha512-BMbpIgoV9aELeBrB0Y120NgoigHb5OdcJwc+4e7uSnbTbamea6lo+gqcc4LAxzMaK3Jf+7LI1oCDE6yANsmxIQ==` |
| `react-stately` | `3.49.0` | `90e49592b8c2aa351c9e25c2ad82f477aa50682dd7ef9afe8c7c11a01f856793` | `sha512-13iNq2KzBrRAzxRc+n53hgROfIistiYY/sPtIhCw1qUB7/kmo+X1xEU2uiS5zcCIrc55AUPwoHqOIIpKWSwB9A==` |

Registry metadata and tarball manifests record the same `gitHead` for all three
packages. Downloaded bytes match their npm SHA-512 integrity values. The ordered
SHA-256 of the three concatenated tarballs is
`775b11dacccd090af9b3a59f47b17dcf03efd7cf09be32b5b8e94dc707167b86`.
The supported range is these exact coordinated versions.

## Source and test boundary

- Repository: `https://github.com/adobe/react-spectrum.git`
- Source roots: `packages/react-aria/src`, `packages/react-aria-components/src`, and `packages/react-stately/src`
- Public entry points: each package's `exports/index.ts`
- Test roots: each package's `test` directory
- License: Apache-2.0; root `LICENSE` SHA-256 `7dfe6526888bac51759c99f9a51262ba2711a8c12a067f2181609dd9a4066b84`
- React oracle: `react@19.2.7` and `react-dom@19.2.7`

The exact source can be reproduced with:

```sh
git clone --filter=blob:none --sparse https://github.com/adobe/react-spectrum.git react-spectrum-aria
git -C react-spectrum-aria checkout 5ecb3333001313e83898cd07644227897e3bae1f
git -C react-spectrum-aria sparse-checkout set packages/react-aria packages/react-aria-components packages/react-stately
```

`audit/upstream-crosswalk.json` classifies all 1,340 public entry-point exports and
198 test-root artifacts: 1,044 exports are `surface-present-unverified`, and 296
remain explicit gaps in the curated root/stately surfaces. These gaps predate
this update. The checkout contains 189 runtime test files, one type test, and eight
support artifacts. Surface presence is not a behavior-parity claim.

## React Aria Components public surface

`@octanejs/aria/components` matches all 286 runtime and 327 type export names from
`react-aria-components@1.20.0`, including the new TokenField and PreviewTrigger
families. `scripts/check-react-aria-components-exports.mjs` checks runtime and type
names separately and rejects missing or extra names in either direction:

```sh
pnpm --filter @octanejs/aria exports:check
```

The root behavior hooks and `/stately` remain curated surfaces. This export check
does not claim complete type assignability or execution of every upstream suite.

## Refreshing source

`scripts/port-advanced-source.mjs` creates a staging tree from the pinned source,
rewrites package boundaries, and copies locale dictionaries. It rejects
`packages/aria` as an output location so mechanical conversion cannot overwrite
reviewed native-event, ref, and hook-slot adaptations.

```sh
node packages/aria/scripts/port-advanced-source.mjs \
  --source-checkout /tmp/react-spectrum-aria \
  --output-root /tmp/octane-aria-upstream
```

Review the release diff, preserve Octane adaptations, and run the export audit,
`tsrx-tsc`, Aria test projects, and Shadcn integration tests. New Adobe source retains
its Apache-2.0 header; `LICENSE-APACHE-2.0` ships the license text. Artifact hashes and
release adaptation notes live in `audit/release-1.20.0.json`.

## Executable evidence

The differential project compiles shared fixtures for Octane and the pinned React
packages. It covers interaction hooks, forms, collections, Select, ComboBox, render
props, keyed updates, Tree/Table, and the new shortcut and TokenField markup cases.

The complete 96-case upstream TokenFieldValue file and its source are vendored under
`upstream/react-stately`. The `aria-token-value-pristine` and
`aria-token-value-adapted` projects run the original source and the Octane adaptation,
respectively. The adaptation preserves every case and assertion while replacing the
source import and test registration and removing the React-version gate. Per-case
inventories and file hashes are recorded in `audit/react-parity.json`.

This is bounded evidence for one upstream file. Other upstream runtime and type
suites have not been adapted case-by-case, so the binding remains
`recorded-unverified`. Octane-only tests separately cover native event wiring, SSR,
hydration, and component integration.

## Intentional divergences

- Native text editing uses `onInput`; value-level `onChange(value)` callbacks retain their names.
- Refs are ordinary props, including adapters for upstream `forwardRef` wrappers.
- React Server Components are outside the Octane binding.
- The i18n server serializer produces valid identifiers after 26 hoisted strings.
- Server locale direction follows the injected locale, including RTL locales.
