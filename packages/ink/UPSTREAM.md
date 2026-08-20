# Ink upstream contract

## Pin and source boundary

| Field | Value |
|---|---|
| Package | `ink` |
| Version | `7.1.1` |
| Canonical tag | `v7.1.1` |
| Canonical commit | `70af033dbd2b126a16f144164685612b2c1fd554` |
| Annotated tag object | `46db5c7499a414e40799f18258a90c4fb1d01cb2` |
| Supported upstream range | exactly `7.1.1` |
| npm tarball SHA-256 | `845b3147ec071c67aa2ba8f42825414231ac950500181b005e1677016c51b39a` |
| npm integrity | `sha512-Y43xxa1ZSPvpmfLHcN5o+OdP8Rf8ykkNJEuKYOUNZKT8wXVNLFTtEm1nSDMQkfBH+YANF4Xuu0hhZ4ejqAtN2w==` |
| License | MIT |

`upstream/src`, `upstream/test`, the upstream package metadata, TypeScript
configuration, XO configuration, and license are vendored from the canonical
tag; every file verifies offline against the upstream git blob shas recorded in
`audit/upstream.lock.json`, and the pinned license is republished at the package
root as `LICENSE.upstream`. The authored port lives in `src`; compiler-facing component modules use
the `.ink.tsrx` suffix and the renderer is replaced by Octane's universal host
driver. Framework-neutral terminal, layout, ANSI, and input modules remain
source-level ports.

## Export crosswalk

| Upstream export group | Octane disposition | Evidence |
|---|---|---|
| `render`, `RenderOptions`, `Instance` | Ported; component and props are separate root arguments | `src/render.ts`, interactive tests |
| `renderToString`, `RenderToStringOptions` | Ported on the native universal driver | `tests/render-to-string.test.ts` |
| `Box`, `Text`, `Static`, `Transform`, `Newline`, `Spacer` and props | Ported to `.ink.tsrx`; refs are ordinary Octane props | component source, renderer tests, public typetest |
| `useInput`, `usePaste`, `Key` | Ported to Octane hooks and Ink's native input parser | hook source, parser/keyboard tests |
| `useApp`, `SuspendTerminal`, `TerminalSuspension` | Ported to Octane context | application source and public typetest |
| stream, focus, screen-reader, cursor, animation, window-size, and box-metrics hooks/types | Ported to Octane contexts/hooks | hook source and public typetest |
| `measureElement`, `ElementMetrics`, `DOMElement` | Ported unchanged over Ink's Yoga DOM | measurement source and public typetest |
| Kitty flags, modifiers, options, and flag names | Ported unchanged | keyboard source and tests |

Upstream internal `reconciler.ts` and React DevTools shims are deliberately not
public exports and are replaced by `host-driver.ts` and `renderer-entry.ts`.

## Upstream test-suite disposition

The complete 111-file upstream `test/` tree is vendored byte-for-byte under
`upstream/test`, including 47 child-process fixtures and its helper modules.
The suite is classified as follows:

| Upstream area | Disposition |
|---|---|
| framework-neutral ANSI, cursor, input-parser, Kitty keyboard, log-update, measurement, sanitization, and synchronized-write suites | Source ported; focused Octane contracts are being registered in the package Vitest project |
| Yoga layout, Box/Text, borders, backgrounds, flex, gap, margin, padding, overflow, position, dimensions, display, and string rendering suites | Renderer-owned source ported; representative native-driver cases run in `tests/render-to-string.test.ts` |
| application lifecycle, render, exit, static output, terminal resize, alternate screen, suspension, and child-process fixtures | Application controller ported; interactive Octane adaptations are maintained under `tests/` |
| input, paste, focus, cursor, animation, metrics, streams, and screen-reader hook suites | Hook/context source ported; Octane adaptations are maintained under `tests/` |
| upstream reconciler-specific assertions | Replaced by native host-driver contracts; React Fiber identities and scheduler internals are not applicable |
| upstream build-output assertion | Replaced by workspace package inventory, typecheck, and source-publication gates |

The parity manifest remains `recorded-unverified`: vendoring and the public
surface are pinned, but the entire AVA/React suite is not claimed as pristine
React-oracle evidence. This avoids overstating the current adapted coverage.
