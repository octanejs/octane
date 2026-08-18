# @zag-js/react upstream contract

## Pin and source boundary

| Field | Value |
|---|---|
| Package | `@zag-js/react` |
| Version | `1.42.0` |
| Canonical tag commit | `df65e4c87c75a1c84eb6eb08a8e30dac0e1bb77f` |
| Supported upstream range | exactly `1.42.0` |
| React oracle | `19.2.7` with `@types/react@19.2.7` and `@types/react-dom@19.2.3` (`catalog:zag-react-oracle`) |
| Testing Library oracle | `@testing-library/react@16.3.2` (`catalog:zag-react-oracle`; satisfies upstream `^16.3.2`) |
| jsdom oracle | `29.0.1` (`catalog:zag-react-oracle`; satisfies upstream `^29.0.1`) |
| Vendored tree integrity | `sha256:037f857d00462559b9790acc2214c818678eb9d61970d6c394dc26dcfcd1516d` (`packages/zag/upstream/SHA256SUMS`) |
| License | MIT, © Chakra UI |

Repository: `https://github.com/chakra-ui/zag.git`. The npm artifact publishes
compiled `dist/` output. The framework adapter source and its Vitest suite at
this pin live under `packages/frameworks/react` in the canonical repository and
are vendored byte-exact at `packages/zag/upstream/` (MIT). Framework-agnostic
`@zag-js/core`, `@zag-js/store`, `@zag-js/types`, and `@zag-js/utils` at the same
version are reused unchanged and are not reimplemented here.

## Runtime export crosswalk

| Upstream export | Octane disposition | Evidence |
|---|---|---|
| `useMachine` | Ported to Octane hooks in `src/machine.ts` | `tests/upstream/machine.test.ts`, `tests/upstream/nested-states.test.ts`, `tests/differential/machine.test.ts` |
| `normalizeProps` | Ported in `src/normalize-props.ts` with documented text-host event rewrite | Framework-contract: `tests/conformance/upstream-surface.test.ts`. Not an upstream-suite identity; see Intentional divergences. |
| `Portal` | Ported in `src/portal.ts` | Differential: `tests/differential/portal.test.ts`. Framework-contract / SSR pins: `tests/conformance/machine.test.ts`, `tests/ssr/server.test.ts` (not counted as React-parity identities). |
| `mergeProps` | Re-exported from `@zag-js/core` | Structural export inventory in `tests/conformance/upstream-surface.test.ts` |
| `useSyncExternalStore` | Re-exported from Octane | Structural export inventory in `tests/conformance/upstream-surface.test.ts` |

## Intentional divergences

- **Text-host `onChange` → `onInput`.** Upstream `normalizeProps` is an identity
  normalizer. Octane rewrites React-style text-entry `onChange` to native
  `onInput` for `normalizeProps.textarea` and `normalizeProps.input` when the
  type is a text-entry host (`text`/`search`/`url`/`tel`/`password`/`email`/
  `number`, plus missing/invalid types that HTML defaults to text).
  `<select>` and non-text inputs (`checkbox`/`radio`/`file`/`date`/`range`/
  …) keep native `onChange`. Upstream has no cases for this export; the rewrite
  is pinned by `tests/conformance/upstream-surface.test.ts` and recorded in
  `status.json`.
- **Portal ref / children shape.** Container refs use Octane's structural
  `{ current: HTMLElement | null }` rather than `React.RefObject`. Compiled
  Octane children blocks portal as one unit so component scope is preserved;
  ordinary value children keep upstream's per-child portal behavior. Mount /
  disabled / root-node behavior is compared against `@zag-js/react@1.42.0` in
  `tests/differential/portal.test.ts`.

## Test-suite disposition

Upstream `@zag-js/react` ships a Vitest runtime suite under
`packages/frameworks/react/tests` at this pin (`machine.test.ts`,
`nested-states.test.ts`, `strict-mode.test.tsx`, plus `render.ts`,
`vite.config.ts`, and `vitest.setup.ts`). That suite is recorded as present and
locked under `packages/zag/upstream/`.

| Upstream artifact | Disposition | Octane location / notes |
|---|---|---|
| `tests/machine.test.ts` | Ported one-for-one | `tests/upstream/machine.test.ts` |
| `tests/nested-states.test.ts` | Ported one-for-one | `tests/upstream/nested-states.test.ts` |
| `tests/strict-mode.test.tsx` | Out of scope for adapted Octane lane | React StrictMode double-invoke is an intentional Octane non-feature; still executed in the pristine React lane. Exact pristine case IDs and rationale are locked in `audit/runtime-case-dispositions.json` and checked by the pristine→adapted inventory crosswalk. |
| `tests/render.ts` | Ported helper | `tests/upstream/render.ts` |

Parity evidence:

- pristine full suite: `zag-pristine` Vitest project / `tests/upstream-original.test.ts`
- adapted full suite: `zag` Vitest project / `tests/upstream/**/*.test.ts`
- differential (supplementary): `zag-differential` / `tests/differential/*.test.ts`
- pristine types: `packages/zag/audit/type-probes` via `tsc`
- adapted types: `packages/zag/typetests` via `tsrx-tsc`

Conformance and SSR tests remain ordinary `zag` / `zag-ssr` package coverage and
are not counted as adapted upstream-suite identities.
