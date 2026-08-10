# Lucide React upstream

`@octanejs/lucide` ports the React-facing layer from
[`lucide-react@1.24.0`](https://github.com/lucide-icons/lucide/releases/tag/1.24.0)
while generating SVG geometry from the matching framework-neutral
`@lucide/icons` package.

## Immutable pin

- Package: `lucide-react@1.24.0`
- Tag and commit: `1.24.0` / `b5b5d95933790a311aa6b7ed232fc8469934acdf`
- Repository: `https://github.com/lucide-icons/lucide.git`
- Source root: `packages/lucide-react/src`
- Test root: `packages/lucide-react/tests`
- License: ISC
- npm archive SHA-256: `ecff662abb2131f6c2dcd00ba4cce1f78bdd2495e7d607f6d2f4fcb9b3e4a58d`
- Supported upstream range: exactly `1.24.0`
- React oracle: `react@19.2.7` and `react-dom@19.2.7`

The npm archive publishes compiled ESM/CJS runtime, declarations, dynamic
entry points, and generated per-icon modules, but not the repository test
suite. The pinned runtime suite has not been vendored or adapted one-for-one,
so the parity manifest remains `recorded-unverified`. The repository has no
separate executable React type-test suite; declarations are build artifacts,
not tests.

## Public surface crosswalk

| Upstream entry point or export | Octane disposition | Evidence or gap |
| --- | --- | --- |
| Root `lucide-react` namespace | Generated port | `tests/exports.test.ts` compares the complete pinned export set, including canonical icons and aliases. |
| Every canonical icon and alias | Generated port | `scripts/generate.mjs --check` rejects drift; the bounded icon differential covers representative named and provided icons. |
| `icons` namespace | Generated port | Exhaustive export test plus local runtime coverage. |
| `Icon` and `createLucideIcon` | Ported | Local runtime coverage and the icon differential; refs use the documented Octane ref-as-prop model. |
| `LucideProvider` and `useLucideContext` | Ported | Local runtime and SSR coverage; exhaustive upstream adaptation remains open. |
| `DynamicIcon`, `iconNames`, `dynamicIconImports` | Ported/generated | Local runtime/export coverage and the dynamic differential. |
| `dynamic.js` / `dynamic.mjs` | Published Octane `./dynamic` | Package export and dynamic differential coverage. |
| `dynamicIconImports.mjs` | Published Octane `./dynamicIconImports` | Generated inventory and local dynamic coverage. |
| Generated per-icon modules | Published Octane `./icons/*` | Generator and exhaustive namespace/subpath checks cover the pinned surface. |

Event callbacks receive native DOM events rather than React synthetic events,
and refs are normal Octane props rather than `forwardRef` components. These
known consumer-facing adaptations remain in `status.json`; the two bounded
equality cases do not claim to verify those differences.

## Upstream suite disposition

| Pinned artifact | Current disposition |
| --- | --- |
| `tests/DynamicIcon.spec.tsx` | Not adapted one-for-one; bounded dynamic differential and local runtime coverage exist. |
| `tests/Icon.spec.tsx` | Not adapted one-for-one; bounded icon differential and local runtime coverage exist. |
| `tests/context.spec.tsx` | Not adapted one-for-one; local context and SSR coverage exist. |
| `tests/createLucideIcon.spec.tsx` | Not adapted one-for-one; local runtime coverage exists. |
| `tests/directives.spec.ts` | Not adapted; React build-directive behavior is outside the Octane runtime contract. |
| `tests/dynamicImports.spec.tsx` | Not adapted one-for-one; bounded dynamic differential and generated inventory coverage exist. |
| `tests/lucide-react.spec.tsx` | Not adapted one-for-one; exhaustive local export checks and bounded runtime evidence exist. |
| `tests/__snapshots__/DynamicIcon.spec.tsx.snap` | Not adapted; belongs to the unvendored upstream suite. |
| `tests/__snapshots__/Icon.spec.tsx.snap` | Not adapted; belongs to the unvendored upstream suite. |
| `tests/__snapshots__/context.spec.tsx.snap` | Not adapted; belongs to the unvendored upstream suite. |
| `tests/__snapshots__/createLucideIcon.spec.tsx.snap` | Not adapted; belongs to the unvendored upstream suite. |
| `tests/__snapshots__/dynamicImports.spec.tsx.snap` | Not adapted; belongs to the unvendored upstream suite. |
| `tests/__snapshots__/lucide-react.spec.tsx.snap` | Not adapted; belongs to the unvendored upstream suite. |
| `tests/setupVitest.js` | Upstream runner support, not an executable test artifact. |
| `tests/testIconNodes.ts` | Upstream fixture/helper, not an executable test artifact. |

## Bounded evidence

The `lucide-runtime-differential` lane compiles the same icon-gallery and
 dynamic-icon `.tsrx` fixtures for React and Octane. It compares named,
 provided, accessible, custom, and loaded output after matching
interactions. Exact test identity selection is fail-closed. These two cases do
not establish exhaustive parity for the generated package surface.
