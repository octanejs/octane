# Upstream provenance

This U1 audit targets the complete published `react-select` package, including
all six JavaScript API entry points. It is not a proposal for an unstyled or
headless subset.

| Field | Pinned value |
| --- | --- |
| Package | `react-select@5.10.2` |
| Supported upstream range | exactly `5.10.2` |
| License | MIT |
| npm integrity | `sha512-Z33nHdEFWq9tfnfVXaiM12rbJmk+QjFEztWLtmXqQhz6Al4UZZ9xc0wiatmGtUOCCnHN0WizL3tCMYRENX4rVQ==` |
| npm SHA-1 | `8dffc69dfd7d74684d9613e6eb27204e3b99e127` |
| Canonical tag object | `dd5ed998713af85f16c31c1f093d71d3c1e0e1bd` |
| Canonical commit | `052e864b4990a67c4ee416851c34d1eb7b58267b` |
| License SHA-256 | `d736dd18c7e53f88217fa2106c748f1a1687bb91d69a1f673fa685269402d784` |
| Published files | 138 |
| Published unpacked bytes | 725,500 |
| Pristine React oracle | `react@16.14.0` and `react-dom@16.14.0` via `react-select-pristine-react` / `react-select-pristine-react-dom` |
| Type oracle | `@types/react@19.2.17` and `@types/react-dom@19.2.3` (literal exact pins in `package.json`) for the required `tsc` lane against pinned `react-select@5.10.2` declarations |
| Pristine Jest | `jest@25.5.4`, `jest-environment-jsdom@25.5.0`, `babel-jest@25.5.1` |
| Pristine Testing Library | `@testing-library/react@12.1.4`, `@testing-library/jest-dom@6.9.1`, `@testing-library/user-event@10.4.1` |
| Pristine Emotion | `@emotion/react@11.9.3`, `@emotion/jest@11.5.0`, `@emotion/cache@11.9.3` |

The published API has root, `base`, `async`, `animated`, `creatable`, and
`async-creatable` JavaScript entry points plus `package.json`. The canonical
source boundary contains 61 files under `packages/select/src`, including
five runtime test files, five snapshot artifacts, and 79 Jest cases at the
pinned commit. The root package directly depends on `@emotion/react`,
`@emotion/cache`, and `react-transition-group`.

The MIT license permits copying, modifying, and distributing an Octane port as
long as the copyright and permission notice are retained. The canonical package
source, five Jest suites, five snapshots, package metadata, and license are
preserved under `upstream/`. `upstream/SHA256SUMS` locks all 63 files
byte-for-byte. Run `pnpm --filter @octanejs/select upstream:verify` to
reject a changed, missing, or additional upstream artifact. The six public
JavaScript entry points and all 20 runtime exports are tracked fail-closed in
`audit/export-crosswalk.json`.

## Public surface disposition

| Entry point | Runtime exports | Octane disposition |
| --- | --- | --- |
| `react-select` | `default`, `NonceProvider`, `components`, `createFilter`, `defaultTheme`, `mergeStyles`, `useStateManager` | Ported and tested |
| `react-select/base` | `default`, `defaultProps` | Ported and tested |
| `react-select/async` | `default`, `useAsync` | Ported and tested |
| `react-select/animated` | `default`, `Input`, `MultiValue`, `Placeholder`, `SingleValue`, `ValueContainer` | Ported and tested through `@octanejs/transition-group` |
| `react-select/creatable` | `default`, `useCreatable` | Ported and tested |
| `react-select/async-creatable` | `default` | Ported and tested |

The paired fixtures in `typetests/upstream.ts` and `typetests/local.ts` compile the same consumer-shaped public types against all six entry points of the pinned React package and the Octane port. `audit/type-parity.json` inventories their assertion groups, runs an executable structural comparison under the permitted import-root transforms, and the control tests reject skipped files, deleted assertions, and removed `@ts-expect-error` markers. A separate cross-environment fixture adds exact or bidirectional structural checks for shared pure value/action contracts and selected non-renderer members: core props, async and creatable configuration, imperative methods, plus component, style, class-name, and accessibility key sets. It is intentionally not described as an exhaustive value-signature proof for every exported declaration. Browser fixtures have a dedicated typecheck project so Vite cannot hide invalid type-only imports. Renderer-owned types deliberately substitute `OctaneNode`, native DOM events, and Octane style objects for ReactNode, synthetic events, and Emotion CSS objects; these consumer-visible adaptations are recorded in `status.json`, `audit/react-parity.json`, and fail-closed in `audit/export-crosswalk.json`. The crosswalk is verified against the actual pinned package exports so a new or removed upstream runtime export fails the repository gate.

## Upstream test disposition

The five canonical Jest suites and their snapshots are retained verbatim under `upstream/src/__tests__`. The required pristine Jest lane (`execution.kind: "jest-full"`) executes them unchanged against the vendored React source with the pinned React 16.14.0, Jest 25.5.x, Testing Library, and Emotion stack recorded above. It verifies 255 passing Jest identities and five snapshots; the three canonical upstream skips are inventoried as individually justified `not-applicable` dispositions in `audit/adaptation.json` (they are not counted as adapted evidence). The `select` project's narrowly owned `tests/upstream/**` lane runs all 255 pristine identities one-for-one across all five suites, including all five adapted snapshots, with `verification: verified` and zero pending adaptations. The other Octane tests remain ordinary repo-authored differential, SSR, browser, verifier, and crosswalk evidence:

| Retained suite | Executable Octane evidence |
| --- | --- |
| `Select.test.tsx` | 186 adapted cases plus full Select SSR and Chromium behavior, styles/components, accessibility, forms, keyboard, mouse, touch, focus, placement, portals, and multi-value navigation |
| `StateManaged.test.tsx` | All 37 cases adapted plus controlled/uncontrolled precedence, transitions, and callbacks in SSR and Chromium |
| `Async.test.tsx` | All 9 cases adapted plus initial SSR state and broader async behavior in Chromium |
| `Creatable.test.tsx` | All 18 cases adapted plus creation metadata, delegated creation, option placement, and suppression differentials |
| `AsyncCreatable.test.tsx` | All 5 cases adapted plus composed async/creatable public contract and export coverage |

`audit/adapted-runtime.json` inventories only the adapted upstream lane. `audit/test-classifications.json` classifies every authored test under `tests/`, including the five adapted upstream suites, so a missing disposition cannot stay green. Run `pnpm --filter @octanejs/select test` to verify the vendored pin, fail-closed export crosswalk, pristine upstream suite, and Octane runtime lanes; run `pnpm --filter @octanejs/select typecheck` for paired type evidence.
