# Upstream provenance and parity crosswalk

- Repository: https://github.com/open-circle/formisch
- Package: `@formisch/react@1.0.0-rc.0`
- Tag commit: `4c494fd8cf105efd04a4b179e9c090595a0bf041`
- Advertised compatibility: exactly `1.0.0-rc.0`
- React oracle: `@formisch/react@1.0.0-rc.0`, React 19.2.7
- Schema peer: Valibot `^1.4.1`
- License: MIT

The byte-exact upstream source, tests, package metadata, and licenses are kept
under `upstream/frameworks/react`, `upstream/packages/core`, and
`upstream/packages/methods`. Those files are development evidence and are not
published by `@octanejs/formisch`.

The npm package contains only compiled output. The canonical repository at the
pinned commit supplies the source and test boundaries. `src/core` and
`src/methods` mirror the React-selected core and methods modules because neither
workspace package is published independently at this release. The React adapter
is re-authored with Octane hooks and `.tsrx` components.

## Public export crosswalk

| Upstream export | Disposition | Evidence |
| --- | --- | --- |
| `Field`, `FieldProps`, `FieldStore`, `FieldElementProps` | Ported | `src/components/Field/Field.tsrx`, `src/hooks/useField/useField.ts`; form, hydration, and public-type tests |
| `FieldArray`, `FieldArrayProps`, `FieldArrayStore` | Ported | `src/components/FieldArray/FieldArray.tsrx`, `src/hooks/useFieldArray/useFieldArray.ts`; form and public-type tests |
| `Form`, `FormProps`, `FormStore` | Ported | `src/components/Form/Form.tsrx`, `src/hooks/useForm/useForm.ts`; form, SSR, hydration, and public-type tests |
| `UseFieldConfig`, `useField` | Ported | `src/hooks/useField/useField.ts`; form, differential, hydration, and public-type tests |
| `UseFieldArrayConfig`, `useFieldArray` | Ported | `src/hooks/useFieldArray/useFieldArray.ts`; form and public-type tests |
| `useForm` | Ported | `src/hooks/useForm/useForm.ts`; form, differential, SSR, hydration, and public-type tests |
| `DeepPartial`, `FieldElement`, `FormConfig`, `FormSchema`, `PartialValues`, `PathValue`, `RequiredPath`, `Schema`, `SubmitEventHandler`, `SubmitHandler`, `ValidArrayPath`, `ValidPath`, `ValidationMode` | Reused from the pinned core | `src/core/types`; `typetests/public-api.test-d.ts` |
| `DeepErrorEntry`, `FocusFieldConfig`, `GetFieldDeepErrorEntriesConfig`, `GetFormDeepErrorEntriesConfig`, `focus`, `getDeepErrorEntries` | Reused from pinned methods | `src/methods/focus`, `src/methods/getDeepErrorEntries`; export test |
| `GetFieldDeepErrorsConfig`, `GetFormDeepErrorsConfig`, `getDeepErrors` | Reused from pinned methods | `src/methods/getDeepErrors`; export test |
| `GetFieldDirtyInputConfig`, `GetFormDirtyInputConfig`, `getDirtyInput` | Reused from pinned methods | `src/methods/getDirtyInput`; export test |
| `GetFieldDirtyPathsConfig`, `GetFormDirtyPathsConfig`, `getDirtyPaths` | Reused from pinned methods | `src/methods/getDirtyPaths`; export test |
| `GetFieldErrorsConfig`, `GetFormErrorsConfig`, `getErrors` | Reused from pinned methods | `src/methods/getErrors`; export test |
| `GetFieldInputConfig`, `GetFormInputConfig`, `getInput` | Reused from pinned methods | `src/methods/getInput`; export test |
| `handleSubmit` | Reused from the React-selected pinned method | `src/methods/handleSubmit`; form test |
| `InsertConfig`, `insert` | Reused from pinned methods | `src/methods/insert`; form and methods-engine tests |
| `IsFieldDirtyConfig`, `IsFormDirtyConfig`, `isDirty` | Reused from pinned methods | `src/methods/isDirty`; export test |
| `IsFieldEditedConfig`, `IsFormEditedConfig`, `isEdited` | Reused from pinned methods | `src/methods/isEdited`; export test |
| `IsFieldTouchedConfig`, `IsFormTouchedConfig`, `isTouched` | Reused from pinned methods | `src/methods/isTouched`; export test |
| `IsFieldValidConfig`, `IsFormValidConfig`, `isValid` | Reused from pinned methods | `src/methods/isValid`; export test |
| `MoveConfig`, `move` | Reused from pinned methods | `src/methods/move`; methods-engine test |
| `PickDirtyConfig`, `pickDirty` | Reused from pinned methods | `src/methods/pickDirty`; export test |
| `RemoveConfig`, `remove` | Reused from pinned methods | `src/methods/remove`; methods-engine test and playground |
| `ReplaceConfig`, `replace` | Reused from pinned methods | `src/methods/replace`; methods-engine test |
| `ResetFieldConfig`, `ResetFormConfig`, `reset` | Reused from pinned methods | `src/methods/reset`; form and methods-engine tests |
| `SetFieldErrorsConfig`, `SetFormErrorsConfig`, `setErrors` | Reused from pinned methods | `src/methods/setErrors`; export test |
| `SetFieldInputConfig`, `SetFormInputConfig`, `setInput` | Reused from pinned methods | `src/methods/setInput`; methods-engine test |
| `submit` | Reused from pinned methods | `src/methods/submit`; export test |
| `SwapConfig`, `swap` | Reused from pinned methods | `src/methods/swap`; methods-engine test |
| `ValidateFormConfig`, `validate` | Reused from pinned methods | `src/methods/validate`; export test |

## Intentional divergences

- Text controls expose native `onInput` for per-edit updates. Selects,
  checkboxes, and radios retain native `onChange`.
- React synthetic event and renderable types become native DOM events and
  `OctaneNode`.
- React StrictMode's delayed signal cleanup does not apply because Octane does
  not double-invoke components in StrictMode.

## Upstream test disposition

The pinned repository has 56 runtime/type test artifacts: 10 in the React
adapter, 21 in core, and 25 in methods. Every artifact now has an executable
disposition:

- All 18 core runtime files (302 cases) and all 23 methods runtime files (205
  cases) run byte-exact against the pinned implementation and again unchanged
  against the Octane-selected source.
- All seven React runtime files run byte-exact against React (42 cases) and have
  one-for-one `.tsrx` adaptations with the same 42 case identities. The
  StrictMode replay case remains executable as the declared
  `formisch-no-strictmode-replay` divergence.
- All eight upstream type-test files run in pristine `tsc` lanes and in
  one-for-one adapted `tsrx-tsc` lanes. The committed inventories cover 164
  test groups and 217 assertions (381 hashed groups in total).
- The pristine React type overlay keeps the three upstream test files
  byte-exact and supplies only adjacent declaration shims for Formisch's
  build-time framework selector. Overlay byte drift is a failing negative
  control.

`audit/react-parity.json` registers all ten required runtime and type lanes, including a port-only resolver canary.
`audit/type-parity.json` records the allowed import-only type transformations,
and `audit/test-classifications.json` classifies every port-authored test.
Negative controls reject missing, renamed, skipped, or structurally changed
runtime/type evidence.

Additional Octane evidence remains deliberately separate from the upstream
claim: `tests/differential/parity.test.ts` is React/Octane differential
coverage; conformance, hydration, and SSR files are Octane-only framework or
divergence contracts.
