# cmdk upstream ledger

`@octanejs/cmdk` targets `cmdk@1.1.1` from
`https://github.com/pacocoursey/cmdk.git`.

## Immutable pin

- Package: `cmdk@1.1.1`
- Tag: `v1.1.1`
- Commit: `fb4ea04e9ec211777fbb39c6104e3c5f2ee107d2`
- npm archive SHA-256: `1a9be8e8b0807338445b4225c295cfcd768bb0a414e3fa317e7407ca39133c53`
- npm lock integrity: `sha512-Vsv7kFaXm+ptHDMZ7izaRsP70GgrW9NBNGswt9OZaVBLlE0SNpDq8eu/VGXyF9r7M0azK3Wy7OlYXsuyYLFzHg==`
- Supported upstream range: exactly `1.1.1`
- License: MIT
- React oracle: `react@19.2.7`, `react-dom@19.2.7`, `@types/react@19.2.17`, and
  `@types/react-dom@19.2.3` via the dedicated `catalog:cmdk-react-oracle` pin
  (exact versions, not `catalog:default`'s caret ranges)

The published archive contains compiled runtime and declarations, but not the canonical
Playwright suite. The byte-exact package source, all test specs and fixtures, test configuration,
package metadata, and license from the tagged repository are vendored under `upstream/`,
pinned by `audit/upstream.lock.json` (offline git-blob-sha verification:
`pnpm react-port:materialize run --check --package-dir packages/cmdk`); the upstream MIT
license is retained byte-exact as `LICENSE.upstream`, hash-matched to the lock.
`upstream/SHA256SUMS` authenticates all 30 files.

## Export crosswalk

| Upstream export | Octane disposition | Evidence or gap |
| --- | --- | --- |
| `Command`, `CommandRoot` | Surface present, unverified | Bounded differential covers root rendering, filtering, selection, and groups; the full upstream suite is not adapted. |
| `Command.Input`, `CommandInput` | Surface present, unverified | Differential covers native input-driven filtering. |
| `Command.List`, `CommandList` | Surface present, unverified | Differential covers result and empty-state rendering. |
| `Command.Item`, `CommandItem` | Surface present, unverified | Differential covers selection and filtering. |
| `Command.Group`, `CommandGroup` | Surface present, unverified | Differential covers group visibility and the recorded ordering divergence. |
| `Command.Separator`, `CommandSeparator` | Surface present, unverified | Octane-only package tests; no adapted upstream case yet. |
| `Command.Dialog`, `CommandDialog` | Surface present, unverified | Octane-only portal tests; upstream Playwright cases remain unadapted. |
| `Command.Empty`, `CommandEmpty` | Surface present, unverified | Differential covers the empty state. |
| `Command.Loading`, `CommandLoading` | Surface present, unverified | Octane-only package tests; no adapted upstream case yet. |
| `useCommandState` | Surface present, unverified | Exercised indirectly by the port; upstream state cases remain unadapted. |
| `defaultFilter` | Reused algorithm, unverified | Framework-neutral scorer tests pass locally; canonical Playwright coverage is not a pristine lane. |

Surface presence is not a full parity claim. The manifest remains `recorded-unverified`.

## Upstream suite disposition

The tagged repository has seven Playwright spec files and eleven page/fixture files. They are
vendored byte-for-byte, including the Next.js pages/fixtures, so `upstreamSuites.runtime` is
`present`. Those specs are not yet wired as required `pristine-upstream` / `adapted-octane`
suite-level lanes. Until those lanes run the pinned suite unchanged in its native environment and
adapt every applicable case (or record an individual disposition), provenance stays
`recorded-unverified`. The existing differential lane is repo-authored evidence that runs the same
`.tsrx` scenarios against both runtimes; it does not replace the suite-level lanes. The release has
no dedicated type assertion suite.

| Upstream spec | Current disposition |
| --- | --- |
| `test/basic.test.ts` | Vendored, not adapted; the differential covers only declared filtering, selection, and empty-state scenarios. |
| `test/dialog.test.ts` | Vendored, not adapted; local dialog tests are Octane framework contracts. |
| `test/group.test.ts` | Vendored, not adapted; the differential covers one grouped-rendering scenario and a structured divergence. |
| `test/item.test.ts` | Vendored, not adapted; local item tests are not counted as upstream parity. |
| `test/keybind.test.ts` | Vendored, not adapted; the differential covers ArrowUp and ArrowDown only. |
| `test/numeric.test.ts` | Vendored, not adapted. |
| `test/props.test.ts` | Vendored, not adapted. |

All files under `test/pages/`, plus `test/style.css`, `test/package.json`, `test/tsconfig.json`, and
`test/next-env.d.ts`, are vendored support for those seven canonical specs and remain unadapted.

## Known divergences

The complete consumer-visible list remains in `status.json`. The differential lane specifically
pins native input events, CSS-order ranking rather than physical node moves, initial
`aria-activedescendant` wiring, and corrected group ordering. Ref-as-prop behavior is documented in
`status.json` but is not yet observed by a paired differential case. `asChild` remains unsupported.
