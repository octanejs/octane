# Upstream provenance

`@octanejs/thinking-orbs` is pinned to `thinking-orbs@0.3.1`.

- repository: https://github.com/Jakubantalik/thinking-orbs
- commit: `bd204b73c9b6660fad7210b1ad48d9dc2adbb89d`
- license: MIT
- npm integrity: `sha512-3BG1aeB1RUTxItCml/BBuIz5JRM4kZqGuyx+vouv0fXTtcR9ZNoKjWGneHPx94y74GxgArwJZ1qbJR5dt54kSw==`

## Source boundary

- `upstream/` is the byte-exact, lock-verified upstream `LICENSE`, README, package manifest, public source, and golden specification data.
- `src/engine/` and `src/presets.ts` adapt the approved MIT framework-neutral source.
- `src/ThinkingOrb.tsrx`, `src/types.ts`, and `src/index.ts` are the Octane component binding.
- The published package includes `LICENSE.upstream`; pristine evidence remains development-only.

## Export crosswalk

| Upstream export | Octane status | Evidence |
| --- | --- | --- |
| `ThinkingOrb` | Ported | `src/ThinkingOrb.tsrx`; component, differential, SSR, and browser evidence |
| `ThinkingOrbProps`, `OrbState`, `OrbSize`, `OrbTheme` | Ported | `src/types.ts`; public type probes |
| `resolvePreset`, `STATE_TO_MODE`, `ModeKey`, `Resolved` | Ported | `src/presets.ts`; engine/golden tests |
| `MODE_DRAWS` | Ported | `src/engine/registry.ts`; canvas-operation tests |
| `./engine` | Ported | Complete framework-neutral engine source and golden-vector tests |
| `./package.json` | Ported | Package export validation |

## Upstream test disposition

The pinned release contains no registered runtime or type test suite. Its two `scripts/extract-*.ts` files generate public specification data and are not test files. Independent package tests validate the public component lifecycle and the checked-in golden geometry vectors.

## Intentional divergences

- Imports use `@octanejs/thinking-orbs`.
- The canvas component uses Octane refs and effects; no React runtime is shipped.
