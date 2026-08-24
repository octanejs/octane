# Upstream provenance

`@octanejs/html-react-parser` is pinned to `html-react-parser@6.1.7`.

- repository: https://github.com/remarkablemark/html-react-parser
- tag: `v6.1.7`
- tag commit: `7c930d10b0b112132a80f782930c3597b13927dc`
- advertised range: `6.1.x`
- license: MIT
- npm integrity: `sha512-TU3KHM2bDXHetJ7mKddkwdMiMJZdgpq2ZmbzGwVo7O4VECTbvczXKwjeA7+LNvy1iAr2/av351VvIis1OPEGfg==`
- npm shasum: `fdf1e5e0686e4233389ecd226aa3fc3ab3dcc251`

## Source boundary

- `upstream/` contains the canonical `src/`, LICENSE, package metadata, and
  configs from the tag. The canonical `__tests__/` tree at the same commit was
  inspected case-for-case for the adapted files listed below.
- `upstream/npm/` is the published tarball.
- Octane `src/` mirrors `upstream/src/`.

Vendored evidence is development-only and excluded from package `files`.

## Export crosswalk

| Upstream export | Octane status | Evidence / divergence |
| --- | --- | --- |
| default `HTMLReactParser` / `parse` | Ported | `src/index.ts`; `tests/index.test.ts` |
| `attributesToProps` | Ported | `tests/attributes-to-props/index.test.ts` |
| `domToReact` | Ported | `src/dom-to-react.ts`; `tests/index.test.ts` |
| `htmlToDOM` | Reused (`html-dom-parser@8.0.2`) | `src/index.ts` |
| `Comment` / `Element` / `ProcessingInstruction` / `Text` | Reused (`domhandler@6.0.1`) | `tests/index.test.ts` |
| `HTMLReactParserOptions` | Ported | `src/types.ts`; ElementDescriptor/OctaneNode |
| `library` option | Ported | defaults to Octane element APIs |

## Upstream test disposition

| Upstream artifact | Disposition |
| --- | --- |
| `__tests__/index.test.tsx` | Adapted case-for-case in `tests/index.test.ts`; element snapshots use Octane `renderToStaticMarkup` output or equivalent public descriptor fields. |
| `__tests__/dom-to-react/index.test.tsx` | Adapted case-for-case in `tests/dom-to-react/index.test.ts`; JSX/snapshots use `createElement`, descriptor assertions, and static HTML. |
| `__tests__/dom-to-react/custom-attributes.test.ts` | Adapted in `tests/dom-to-react/custom-attributes.test.ts`; the React-15 version gate is an explicit Octane divergence and custom attributes remain preserved. |
| `__tests__/attributes-to-props/index.test.ts` | Ported as-is to `tests/attributes-to-props/index.test.ts` |
| `__tests__/attributes-to-props/preserve-custom-attributes.test.ts` | Ported as-is (vi.mock) |
| `__tests__/utilities.test.ts` | Adapted case-for-case in `tests/utilities.test.ts`; `PRESERVE_CUSTOM_ATTRIBUTES` asserts Octane's always-true contract. |
| `__tests__/options/trim.test.ts` | Adapted case-for-case in `tests/options/trim.test.ts`; HTML assertions are retained. |
| `__tests__/options/trusted-type-policy.test.ts` | Adapted case-for-case in `tests/options/trusted-type-policy.test.ts`. |
| `__tests__/esm/*` | Out of scope: published CJS/ESM node:test after upstream build |
| `__tests__/integration/` | Out of scope: webpack/build integration |
| vitest browser config | Out of scope: browser runner |

## Intentional divergences

- Default `library` is Octane, not React.
- `PRESERVE_CUSTOM_ATTRIBUTES` is `true` regardless of `octane.version`.
- Octane serializes style objects through CSSOM. Custom-element markup may
  differ in vendor-prefix spelling and spacing from React snapshots; the
  parsed `style` object is the parser contract.
