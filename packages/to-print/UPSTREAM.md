# Upstream provenance

`@octanejs/to-print` is pinned to `react-to-print@3.3.0`.

- repository: https://github.com/MatthewHerbst/react-to-print
- tag: `v3.3.0`
- tag commit: `853666f180006b68b533f216e58f974cc791a97f`
- advertised range: `3.3.x`
- license: MIT
- npm integrity: `sha512-7j9GIeNZA9glZlbv9mIbIHDOOx+WYfRMbJzh04NiSKjdaeGkxJuKjJQrtRuNKtt5AvEVVjrLCPokZ9yJX51Fvg==`
- npm shasum: `7c893951b2c621a1c2190cb57a88af40852b129c`

## Source boundary

- `upstream/src/` is the canonical tagged TypeScript source, LICENSE, README, and CHANGELOG.
- `upstream/npm/` is the published tarball (compiled `dist/`).
- Octane `src/` mirrors `upstream/src/` module-for-module.

Vendored evidence is development-only and excluded from package `files`.

## Export crosswalk

| Upstream export | Octane status | Evidence / divergence |
| --- | --- | --- |
| `useReactToPrint` | Ported | `src/hooks/useReactToPrint.ts`; explicit trailing hook-slot forwarding; `tests/to-print.test.ts` |
| `UseReactToPrintFn` | Ported | `src/types/UseReactToPrintFn.ts` |
| `UseReactToPrintOptions` | Ported | `src/types/UseReactToPrintOptions.ts`; `contentRef` is `{ current: ContentNode \| null }` |
| `UseReactToPrintHookContent` | Ported | `src/types/UseReactToPrintHookContent.ts`; `Event` instead of `React.UIEvent` |
| `ContentNode` | Ported | `src/types/ContentNode.ts` |
| `Font` | Ported | `src/types/font.ts` |

## Upstream test disposition

| Upstream artifact | Disposition |
| --- | --- |
| package `scripts` (`build`, `lint`, `start`; no `test`) | Confirmed at pin: the repository has no unit test suite. Examples live outside `src/`. |
| `examples/` (if present in the tag) | Out of scope: demo app, not a test oracle |

Octane behavioral coverage is `tests/to-print.test.ts` (hook return, missing content diagnostic, custom `print`). It is Octane-only because upstream ships no unit tests.

## Intentional divergences

- React `RefObject` / `IframeHTMLAttributes` / `UIEvent` types are replaced with structural DOM types.
- The plain TypeScript hook forwards its compiler-injected trailing slot to
  `useCallback`; when called without options, a symbol in the options position
  is treated as empty options.
