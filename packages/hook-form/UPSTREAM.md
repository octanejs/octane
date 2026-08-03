# react-hook-form upstream contract

## Pin and source boundary

| Field | Value |
|---|---|
| Package | `react-hook-form` |
| Version | `7.81.0` |
| Canonical tag commit | `46b217e034dd92f7aa3cb3a478815556b416b299` |
| Supported upstream range | exactly `7.81.0` |
| React oracle | `19.2.7` |
| Canonical archive SHA-256 | `2d49ffe1a26427eb579201d574fa6a76903f8a15bae5b0bab20c434273ebc8bd` |
| License | MIT, © Beier (Bill) Luo |

The npm artifact publishes compiled `dist/` output and declarations only. The
byte-exact source, original tests, snapshots, Jest configuration, package
metadata, and license therefore come from the canonical repository at the tag
commit above. They live under `upstream/`, are excluded from the published
package, and are locked file-by-file by `upstream/SHA256SUMS`.

Run `pnpm --dir packages/hook-form upstream:verify` to check the vendored bytes
and the one-for-one adapted-suite inventory. Run
`pnpm --dir packages/hook-form test:upstream` to execute the original React/Jest
suite unchanged.

## Runtime export crosswalk

| Upstream export | Octane disposition | Evidence |
|---|---|---|
| `Controller` | Ported to `src/controller.tsrx` | `tests/upstream/controller.test.tsx`, `tests/upstream/useController.test.tsx` |
| `Form` | Ported to `src/form.tsrx` | `tests/upstream/form.test.tsx` |
| `FormProvider` | Ported to `src/FormProvider.tsrx` | `tests/upstream/useFormContext.test.tsx` |
| `FormStateSubscribe` | Ported to `src/formStateSubscribe.tsrx` | `tests/upstream/formStateSubscribe.test.tsx` |
| `Watch` | Ported to `src/watch.tsrx` | `tests/upstream/watch.test.tsx` |
| `appendErrors` | Reused framework-neutral logic | `tests/upstream/logic/appendErrors.test.ts` |
| `createFormControl` | Reused framework-neutral logic | `tests/upstream/logic/createFormControl.test.ts` |
| `get` | Reused framework-neutral utility | `tests/upstream/utils/get.test.ts` |
| `set` | Reused framework-neutral utility | `tests/upstream/utils/set.test.ts` |
| `useController` | Ported to Octane hooks; `field.onInput` is the documented event divergence | `tests/upstream/useController.test.tsx` |
| `useFieldArray` | Ported to Octane hooks | `tests/upstream/useFieldArray.test.tsx` and `tests/upstream/useFieldArray/` |
| `useForm` | Ported to Octane hooks | `tests/upstream/useForm.test.tsx` and `tests/upstream/useForm/` |
| `useFormContext` | Ported to Octane context | `tests/upstream/useFormContext.test.tsx` |
| `useFormState` | Ported to Octane hooks | `tests/upstream/useFormState.test.tsx` |
| `useWatch` | Ported to Octane hooks | `tests/upstream/useWatch.test.tsx` |
| `types/controller` exports | Ported; event-facing controller fields expose `onInput` | `typetests/` and package typecheck |
| `types/errors` exports | Ported at the same module path | `typetests/` and package typecheck |
| `types/events` exports | Ported; native change events map to input events | `typetests/` and package typecheck |
| `types/fieldArray` exports | Ported at the same module path | `typetests/` and package typecheck |
| `types/fields` exports | Ported; event-facing fields expose `onInput` | `typetests/` and package typecheck |
| `types/form` exports | Ported at the same module path | `typetests/` and package typecheck |
| `types/path` exports | Ported at the same module path | `typetests/` and package typecheck |
| `types/resolvers` exports | Ported at the same module path | `typetests/` and package typecheck |
| `types/utils` exports | Ported at the same module path | `typetests/` and package typecheck |
| `types/validator` exports | Ported at the same module path | `typetests/` and package typecheck |
| `types/watch` exports | Ported at the same module path | `typetests/` and package typecheck |

`tests/conformance/exports.test.ts` compares the runtime namespace to the real
package and fails for either a missing export or an accidental extra.
`index.react-server.ts` is not a public runtime export in Octane because Octane
does not implement React Server Components; ordinary SSR is supported and
covered by every adapted `*.server.test.tsx` counterpart.

## Test-suite disposition

The tagged repository contains 119 test artifacts: 115 test files plus four
snapshots. Every relative path under upstream `src/__tests__/` has an adapted
counterpart under `tests/upstream/`. The verifier extracts registrations from
both trees and currently accounts for 1,178 upstream registrations and 1,181
adapted registrations.

The unfiltered execution inventories are a separate collection-time
measurement. They contain 1,187 entries representing 1,178 unique
file/full-name identities. All nine duplicate entries are repeated titles
within the DOM inventory; the server inventory shares no file or test identity
with it. The manifest records these measurements structurally, and validation
recomputes them from the committed inventories.

Three upstream titles are deliberately mapped to their Octane equivalents:

- `field.onChange` → `field.onInput` in the controller promise case;
- the same native-event rename in the resolver subscriber case; and
- React's batched trigger notification case → Octane's documented commit-order
  notification case.

The adapted suite adds three Octane regression cases for registered array-valued
dirty fields. These are explicit additions, not substitutes for upstream cases.
There are no skipped, todo, or expected-failure cases. Any removed/renamed test
artifact, unrecorded title change, missing extra, or vendored-byte drift fails
`upstream:verify`.

In the root Vitest project, `testExecution.group: react-parity` owns the adapted
upstream and differential test patterns. The ordinary sharded config derives
their complement, so the package-authored conformance cases still run without
repeating manifest-owned parity work. This follows the repository-wide
[React parity test-execution contract](../../docs/react-parity-testing.md); the
workflow does not enumerate this package.

The pristine lane runs all 1,193 tests and eight snapshots in the original Jest
suite against React. Its local Jest wrapper removes only the optional
`jest-preview` dashboard transforms/setup; test source, SWC transformation,
environments, assertions, and snapshots remain upstream-exact. The adapted and
differential lanes then verify the Octane port, including the native input-event
divergence.
