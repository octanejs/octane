# Upstream provenance

`@octanejs/content-loader` is pinned to `react-content-loader@7.1.2`.

- repository: https://github.com/danilowoz/react-content-loader
- tag commit: `c8a6b6c6669d7e663f9d7e1efecec08e876b0e5d`
- advertised range: `7.1.x`
- license: MIT
- npm integrity: `sha512-naFG7OERUQNPKQt1QWHyBF0/y6Zmr7dOzqjs1U5yOnu4OZmcE3+b/blp40dEKa9lvYAzOuj5dvfTK1cg5YWJkA==`
- npm shasum: `ca2c2e2f28cafc9595a7c39f30153561e65586e7`

Git `package.json` at this SHA still says `6.2.1`; npm published `7.1.2`
from that commit.

## Source boundary

- `upstream/src/` is the canonical web and native source with its Jest tests.
- `upstream/npm/` is the published tarball.
- Octane `src/web/` mirrors `upstream/src/web/`.

Vendored evidence is development-only and excluded from package `files`.

## Export crosswalk

| Upstream export | Octane status | Evidence / divergence |
| --- | --- | --- |
| default `ContentLoader` | Ported | `src/web/ContentLoader.tsrx`; `tests/content-loader.test.ts` |
| `Facebook` | Ported | `src/web/presets/FacebookStyle.tsrx`; complete SVG DOM and shape-count assertions |
| `Instagram` | Ported | `src/web/presets/InstagramStyle.tsrx`; complete SVG DOM and shape-count assertions |
| `Code` | Ported | `src/web/presets/CodeStyle.tsrx`; complete SVG DOM and shape-count assertions |
| `List` | Ported | `src/web/presets/ListStyle.tsrx`; complete SVG DOM and shape-count assertions |
| `BulletList` | Ported | `src/web/presets/BulletListStyle.tsrx`; complete SVG DOM and shape-count assertions |
| `IContentLoaderProps` | Ported | Octane SVG intrinsic props plus `OctaneNode` for `beforeMask` |
| `./native` | Explicit gap | Requires React Native and `react-native-svg`; Octane has no React Native renderer |

## Upstream test disposition

All web cases below are adapted in `tests/content-loader.test.ts`. Assertions
formerly tied to `react-test-renderer`, its shallow renderer, or snapshots
observe the mounted SVG DOM and retain the upstream numeric and prop
expectations.

| Upstream artifact | Disposition |
| --- | --- |
| `src/web/__tests__/Svg.test.tsx` | Adapted case-for-case |
| `src/web/__tests__/ContentLoader.test.tsx` | Adapted case-for-case; renderer swapped to mounted DOM |
| `src/web/__tests__/index.test.tsx` | Adapted case-for-case |
| `src/web/__tests__/uid.test.tsx` | Adapted case-for-case |
| `src/web/__tests__/snapshots.test.tsx` | Adapted case-for-case as complete observable SVG markup |
| `src/web/__tests__/presets/FacebookStyle.test.tsx` | Adapted case-for-case |
| `src/web/__tests__/presets/InstagramStyle.test.tsx` | Adapted case-for-case |
| `src/web/__tests__/presets/CodeStyle.test.tsx` | Adapted case-for-case |
| `src/web/__tests__/presets/ListStyle.test.tsx` | Adapted case-for-case |
| `src/web/__tests__/presets/BulletListStyle.test.tsx` | Adapted case-for-case |
| Web snapshot files | Replaced by exact assertions over observable SVG markup; no case dropped |
| `src/native/__tests__/**` and native snapshots | Out of scope with the explicit `./native` renderer gap |

## Intentional divergences

- `beforeMask` is typed as `OctaneNode`, and only valid Octane element
  descriptors are inserted, matching the upstream runtime guard.
- `useId` has Octane's opaque identifier format. Relationships and uniqueness,
  rather than identifier spelling, are the public contract.
- Octane serializes SVG/CSS `url()` functions with quotes (`url("#id")`)
  while React's test renderer reports the unquoted form (`url(#id)`). Tests
  compare the unquoted uniqueKey/baseUrl relationship.
- Octane inserts empty comment holes between children. Snapshots compare the
  public SVG tree after those markers are stripped.
- The React Native `./native` entry is not published.
