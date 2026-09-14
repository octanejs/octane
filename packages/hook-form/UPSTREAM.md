# react-hook-form upstream contract

## Pin

| Field | Value |
|---|---|
| Package | `react-hook-form` |
| Version | `7.88.0` |
| Canonical tag commit | `28334faa6105b0475060592c6bf27dca87e3941e` |
| Supported upstream range | exactly `7.88.0` |
| Unit-test React oracle | `19.2.7` |
| Browser React oracle | `19.0.0`, matching `upstream/app/pnpm-lock.yaml` |
| Browser toolchain | Vite `6.4.3`, React plugin `4.3.4`, React Router `6.28.1` |
| npm tarball integrity | `sha512-QRaLOWhX93YCnMiRfnOFRSwWXZNt8qhm2JTZwypoDvKpSffTJHmpzMXt8U6PV5UThvL3IiiLDUWe2nHMtz6Mmw==` |
| License | MIT, © Beier (Bill) Luo |

## Source boundary

The npm artifact publishes compiled `dist/` output and declarations only. The
byte-exact source, original tests, snapshots, Jest configuration, package
metadata, and license therefore come from the canonical repository at the tag
commit above. They live under `upstream/`, are excluded from the published
package, and verify offline against the upstream git blob shas recorded in
`audit/upstream.lock.json`. The pinned license is republished at the package
root as `LICENSE.upstream`.

Run `pnpm --dir packages/hook-form upstream:verify` to check the vendored bytes
and the one-for-one adapted-suite inventory. The adapted suite under
`tests/upstream/` is regenerated, never committed: the lock's mechanical
`adaptedRewrites` retarget every import at Octane (react → octane,
`@testing-library/react` → `@octanejs/testing-library`, upstream source paths →
the binding's `src/`), and the committed patches under `audit/upstream-patches/`
carry the intentional divergences. Run `pnpm --dir packages/hook-form
test:upstream` to execute the original React/Jest suite unchanged. The separate
`upstream-artifact/` directory retains the authenticated npm archive and its
published declaration bytes, verified by `audit/provenance.json`.

## Runtime export crosswalk

| Upstream export | Octane disposition | Evidence |
|---|---|---|
| `Controller` | Ported to `src/controller.tsrx` | `tests/upstream/controller.test.tsx`, `tests/upstream/useController.test.tsx` |
| `ErrorMessage` | Ported to `src/errorMessage.tsrx` | `tests/upstream/errorMessage.test.tsx`, `tests/browser/browser.test.ts` |
| `FieldArray` | Ported to `src/fieldArray.tsrx` | `tests/hydration.test.ts`, strict upstream field-array type tests |
| `FormState` | Ported to `src/formState.tsrx` | `tests/upstream/formStateSubscribe.test.tsx`, `tests/hydration.test.ts` |
| `Form` | Ported to `src/form.tsrx` | `tests/upstream/form.test.tsx` |
| `FormProvider` | Ported to `src/FormProvider.tsrx` | `tests/upstream/useFormContext.test.tsx` |
| `FormStateSubscribe` | Deprecated compatibility alias for `FormState` | `tests/upstream/formStateSubscribe.test.tsx` |
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

The immutable lock contains 355 source, test, application, configuration, and
license files. Runtime tests map from `src/__tests__` to `tests/upstream`; strict
type tests map from `src/__typetest__` to `tests/upstream/_types`; browser fixtures
and Playwright cases map into `_app` and `_e2e`. Generated adaptations are ignored
by Git and reproduced offline from pristine bytes, mechanical rewrites, and
committed patches. The pristine tree and npm artifacts never contain local edits.

The original Jest suite contains 1,364 executed entries and 26 snapshots. Its
DOM and Node projects each execute the nine server cases. Octane executes those
nine server cases once and 1,346 DOM cases, giving 1,355 adapted entries and 1,346
unique file/title identities. Nine repeated titles are preserved with distinct
occurrence identities. The dirty-array regressions previously added only to
Octane are now present upstream and need no local additions.

All strict type files and their assertion groups remain in separate pristine
`tsc` and adapted `tsrx-tsc` programs with `skipLibCheck: false`. This includes the
runtime-located `type.test.tsx` as well as the dedicated upstream type directory.
Published API probes also verify precise field paths, errors, submit return
values, renderer properties, and negative controls.

The browser wrapper checks the exact file/title multiset and execution status of
all 90 pinned Playwright registrations. The pristine lane builds the immutable TypeScript source and uses the real React
application with its locked React, Vite, React plugin, and router versions. The adapted lane substitutes a route-parameter fixture for the React
Router shell and executes the original native form fixtures and assertions.
Three cases in `controller.spec.ts` mount React MUI 5 components and assert MUI
portal DOM. They remain visible as inapplicable external integrations in
`audit/crosswalk.json`, with a durable materialization skip rationale; this
existing-binding campaign does not introduce a MUI port. All 87 supported browser
cases execute in Chromium, including the existing Octane Select integration.

Both browser lanes use one worker and a 10 ms browser-command delay. The pinned
fixtures observe intermediate renders between inputs and closely spaced timers;
consistent command pacing avoids coalescing those observations during burst
input. The runners retain all original assertions and use zero retries.

Native text fields expose `onInput`; selects, checkboxes, radios, and component
callbacks retain their respective contracts. The StrictMode fixture uses a
Fragment because Octane has no React development double-invoke mode. A resolver
visibility update commits separately from its unregister effect in Octane, so
that browser case preserves all validity assertions and expects eight renders
instead of React's seven. The existing structured divergence ledger documents
these native-event and scheduling boundaries. No supported case uses an expected
failure, weakened behavior assertion, or silent omission.

Additional conformance evidence checks native events, focus, keyed field-array
survivors, SSR/hydration node adoption, server-effect exclusion, actual File bytes
in FormData, function action success/rejection, and subscription cleanup.
Differential cases run the same consumer actions through React and Octane.

The root Vitest projects and required parity lanes follow the shared
[React parity test-execution contract](../../docs/react-parity-testing.md).
