# Base UI upstream ledger

`@octanejs/base-ui` targets `@base-ui/react@1.6.0` from
`https://github.com/mui/base-ui.git`.

| Package | Version | Tag | Commit | npm SHA-256 |
| --- | --- | --- | --- | --- |
| `@base-ui/react` | `1.6.0` | `v1.6.0` | `b34551d644f2e58ebf8fc1050d949f6654ceca6c` | `583e60023a77fed45caf8a2f980813e8a75e2f2a97f59c30380d2234cc3e0423` |

The lockfile integrity is
`sha512-/jzjTWJYXhRFO45Bev9lc3cHbmjzCMpUqbMZ2AgKy/z25mY9B6shGSNcXcjQar9n5doM0KYW1W8fcFv2jZBuMw==`.
The annotated tag is unsigned and peels to the commit above. The supported range is this exact
release; upgrades require a new crosswalk.

## Source and test boundary

- Canonical package root: `packages/react`
- Public surface: the non-internal component/utility subpaths in `packages/react/package.json`
- Runtime/type tests: `packages/react/src/**/*.{test,spec}.{ts,tsx}`
- Shared test/support root: `packages/react/test`
- License: MIT; pinned root `LICENSE` SHA-256
  `07fc1b39d69d14bc7d40482a628f47226258eb01265db68ae684944b916beb2a`
- React oracle: the workspace-pinned React and React DOM versions used by `@base-ui/react`

The byte-exact React-facing source, runtime/type suites, shared support files, package metadata,
and MIT license are vendored under `upstream/`. All 1,129 vendored files verify offline against
the upstream git blob shas recorded in `audit/upstream.lock.json`, and the pinned license is
republished at the package root as `LICENSE.upstream`. To restore or extend the vendored
tree, fetch the pinned files with
`pnpm react-port:materialize run --package-dir packages/base-ui` (or re-vendor from an
immutable checkout of tag `v1.6.0` and re-run the lock).

`audit/upstream-crosswalk.json` records all 43 public component/utility subpaths and 348
runtime, type, and support artifacts. It classifies 35 subpaths as
`surface-present-unverified` and eight as explicit gaps: Autocomplete, Combobox, Drawer,
Navigation Menu, OTP Field, Scroll Area, Select, and Toolbar. Surface presence is not a
behavioral parity claim.

The canonical package has 273 runtime test files, 35 type-test files, and 40 support
artifacts. Ten upstream Accordion, Collapsible, and Tabs files have selected cases adapted locally; the
remaining suite is vendored but not adapted in full, so the binding remains
`recorded-unverified`. The published npm package contains no canonical test files; that
registry boundary is not evidence that the repository suite is absent.

## Executable evidence

The differential lane runs all 98 authored same-fixture scenarios against both Octane and the
pinned `@base-ui/react` package and verifies their exact inventory. A separate adapted lane runs
the 49 currently collected Accordion, Collapsible, and Tabs cases (selected transcriptions from
the pin, not the full 273-file upstream runtime suite) and verifies that inventory. Focused lanes
bind representative cases to structured divergences. Local crosswalk/gap contract tests run in the
ordinary `base-ui` Vitest project and are not react-parity evidence. Pristine upstream runtime,
pristine type, and one-for-one adapted type lanes are still required before this binding can leave
`recorded-unverified`.

## Intentional divergences and known gaps

- Host handlers use native DOM events rather than React's synthetic event layer.
- React `forwardRef` wrappers become ref-as-prop; class values use Octane composition rules.
- Base UI's internal standalone `useHover` combiner is not republished because no ported Base
  UI component consumes it.
- The shared default Tooltip delay-group refs match the pinned upstream behavior.
- `NumberField.ScrubArea` and press-and-hold stepping remain gaps; steppers handle single
  presses only.

Structured divergence records and their executing cases live in `audit/react-parity.json`.
