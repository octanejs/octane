# react-email upstream contract

## Pin and source boundary

| Field | Value |
|---|---|
| Package | `react-email` / `@react-email/components` |
| Version | `6.9.2` / `@react-email/components@1.0.12` |
| Canonical commit | `ffe605819782b31d7f946e30f938b1b63e6b239c` |
| Supported upstream range | exactly `6.9.2` |
| React oracle | `19.2.7` |
| License | MIT |

The upstream monorepo ships compiled packages on npm. Pristine upstream runtime
suites have not yet been vendored or executed here, so the parity manifest
records this pin as `recorded-unverified`.

## Export crosswalk

| Upstream export | Octane disposition | Evidence |
|---|---|---|
| `Body`, `Button`, `Column`, `Container`, `Font`, `Head`, `Heading`, `Hr`, `Html`, `Img`, `Link`, `Row`, `Section`, `Text` | Ported to Octane components | `tests/render.test.ts`, differential welcome render lane |
| `Preview` | Ported with explicit `text` prop | `tests/render.test.ts` |
| `Markdown`, `CodeBlock`, `CodeInline`, Prism themes | Ported with Octane-specific props | `tests/rich-content.test.ts` |
| `Tailwind`, `pixelBasedPreset` | Ported with post-render HTML transform | `tests/tailwind.test.ts` |
| `render` | Ported as component-plus-props entry point | `tests/render.test.ts`, differential welcome render lane |
| Public prop/style types | Ported structurally | package source and README |

## Test-suite disposition

Upstream ships Playwright and package-local tests in the monorepo, but they are
not yet vendored here. Repository-authored Octane conformance tests cover render,
Tailwind, and rich content contracts. One shared welcome-email fixture is
registered as bounded React parity evidence through `@react-email/render`.
Advancing the manifest to `verified` requires byte-exact vendoring, pristine
execution, one-for-one adaptation, and exhaustive test classification.
