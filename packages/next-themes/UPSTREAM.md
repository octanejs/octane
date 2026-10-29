# next-themes upstream ledger

`@octanejs/next-themes` targets `next-themes@0.4.6` from
`https://github.com/pacocoursey/next-themes.git`, package directory `next-themes/`.

## Immutable pin

- Package: `next-themes@0.4.6` (latest on npm)
- Tag: `v0.4.6`
- Commit: `3a43743798db3008a0fc59e8bcc9d6e1bb5d4752`
- npm archive SHA-256: `07e1be7d92087c76ac3cfc7b1ecc46cc42963678a48b5d7908f7b64b5db80bb3`
- npm lock integrity: `sha512-pZvgD5L0IEvX5/9GWyHMf3m8BKiVQwsCMHfoFosXtXBMnaS0ZnIJ9ST4b4NqLVKDEm8QBxoNNGNaBv2JNF6XNA==`
- License: MIT, retained byte-exact as `LICENSE.upstream`

npm publishes no `gitHead` and no provenance attestation for this release, so the
port preflight cannot derive the commit from the registry. The pin is the release
tag instead, and these checks tie it to the published tarball:

- The tag's `next-themes/package.json` declares `next-themes@0.4.6`. It is
  JSON-equal to the tarball's manifest, which pnpm re-serialized on publish.
- The tarball's `README.md` and `license.md` have the same git blob hashes as the
  tag's files.
- The tag commit (2025-03-11 21:00:14 UTC) is the release commit 2 minutes before
  npm published 0.4.6 (21:02:05 UTC). The only source change since `v0.4.5` is
  the `script.ts` null check this port carries.

`audit/upstream.lock.json` pins every file of the package directory at that commit
by git blob hash, and `pnpm react-port:materialize run --check --package-dir
packages/next-themes` verifies the committed `upstream/` tree offline. The npm
tarball is kept in `upstream-artifact/`, hash-pinned by `audit/provenance.json`.

## Source crosswalk

| Upstream | Port | Adaptation |
| --- | --- | --- |
| `src/index.tsx` | `src/index.tsrx` | Hooks and `memo` from `octane`; `<ThemeContext value>` for `Context.Provider`; `'use client'` dropped; parameter types for strict TypeScript. Every dependency array is upstream's. |
| `src/script.ts` | `src/script.ts` | Parameter types only. |
| `src/types.ts` | `src/types.ts` | Octane's `DetailedHTMLProps`, `ScriptHTMLAttributes`, `Dispatch`, `SetStateAction`, `PropsWithChildren`. |

## Export crosswalk

| Upstream export | Disposition | Evidence |
| --- | --- | --- |
| `ThemeProvider` | Ported | All 28 upstream cases, adapted; differential cases; SSR and hydration tests |
| `useTheme` | Ported | All 28 upstream cases, adapted; differential cases |
| `Attribute`, `ThemeProviderProps`, `UseThemeProps` | Ported | `typetests/public-api.test-d.ts` |

## Behavioral oracle

- **Pristine lane** (`next-themes-pristine`): the pinned `__tests__/index.test.tsx`
  runs unchanged against the pinned source on React 19.2.7 and
  `@testing-library/react`, all 28 registrations.
- **Adapted lane** (`next-themes-adapted`): the same file, regenerated from the
  lock with import rewrites only (`react` to `octane`, `@testing-library/react`
  to `@octanejs/testing-library`, `../src/*` to the port), runs against Octane.
  It needs no divergence patch.
- **Differential lane** (`next-themes-differential`): drives the pinned React
  source and the port through the same steps and compares the page state after
  each, covering what upstream tests only through its Next.js e2e app: system
  preference changes, storage events from other tabs, `forcedTheme`,
  `disableTransitionOnChange`, and the server-rendered inline script.
- **Octane-only tests**: `tests/hydration.test.ts` server-renders, runs the
  inline script, and hydrates; `tests/ssr/server.test.ts` renders through
  `octane/server` with no browser globals.

The repository's Playwright suite (`test/` at the repository root) drives the
Next.js example app, not the package, and is outside the pinned package
directory. The differential lane covers the same behaviors.

`scripts/update-audit.mjs` regenerates the committed inventories, crosswalk,
closure, and `audit/react-parity.json`.

## Updating

Move the lock to the new release tag with `pnpm react-port:materialize lock --pin`,
commit the refreshed `upstream/` tree, port the source diff, regenerate the
adapted suite, and rerun `node packages/next-themes/scripts/update-audit.mjs`.
