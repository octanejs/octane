# Upstream provenance

`@octanejs/stick-to-bottom` is pinned to `use-stick-to-bottom@1.1.6`.

- repository: https://github.com/stackblitz/use-stick-to-bottom
- tag: `1.1.6`
- tag commit: `8d6a19a0ca6ab632830588073e6a29312a06a088` (npm tarball had no `gitHead`; SHA is the tagged commit)
- advertised range: `1.1.x`
- license: MIT
- npm integrity: `sha512-z3Up8jYQGTkUCsGBnwg6/wj70KgXoW5Kz1AAc1j8MtQuYMBo6ZsdhrIXoegxa7gaMMilgQYyTohTrt3p94jHog==`
- npm shasum: `c35e7f9bcb1ee3da0c059c448fb9a61bdf01fe6b`

## Source boundary

- `upstream/src/` is the canonical tagged source (`useStickToBottom.ts`, `StickToBottom.tsx`, `index.ts`), LICENSE, README, CHANGELOG, and tsconfig.
- `upstream/npm/` is the published tarball (compiled `dist/`).
- Octane `src/` mirrors `upstream/src/`.

Vendored evidence is development-only and excluded from package `files`.

## Export crosswalk

| Upstream export | Octane status | Evidence / divergence |
| --- | --- | --- |
| `useStickToBottom` | Ported | `src/useStickToBottom.ts`; upstream logic retained with structural ref types and explicit hook-slot forwarding; `tests/stick-to-bottom.test.ts` |
| `StickToBottom` | Ported | `src/StickToBottom.tsrx` |
| `StickToBottom.Content` | Ported | Assigned as `StickToBottom.Content` |
| `useStickToBottomContext` | Ported | throws outside provider; `tests/stick-to-bottom.test.ts` |
| `StickToBottomState` / options / instance types | Ported | `src/useStickToBottom.ts` |

## Upstream test disposition

| Upstream artifact | Disposition |
| --- | --- |
| package scripts (`dev`, `build`, `lint`; no `test`) | Confirmed at pin: the repository has no unit test suite |
| Demo / playground | Out of scope |

Octane behavioral coverage is `tests/stick-to-bottom.test.ts`. It is Octane-only because upstream ships no tests.

## Intentional divergences

- React ref types are structural.
- The plain TypeScript hook accepts and forwards a compiler-injected trailing
  slot; when called without options, a symbol in the options position is
  treated as empty options.
