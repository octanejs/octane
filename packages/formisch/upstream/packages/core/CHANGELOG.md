# Changelog

All notable changes to the library will be documented in this file.

## v1.0.0-rc.0 (June 23, 2026)

- Release candidate for v1.0.0

## v0.10.0 (June 22, 2026)

- Add `emptyInput` form config to define the value a required field of a given type starts at when no initial input is provided, defaulting to `{ string: '' }` so an untouched string field matches the DOM and validates with its own message instead of a type mismatch (issue #53)
- Change `FormSchema` to structurally accept any schema with an object output, so generic object schemas (e.g. `v.GenericSchema<{ email: string }>`) can again be used to type a partial `FormStore` for reusable field components (issue #147)

## v0.9.0 (June 21, 2026)

- Add `isEdited` field state that is set when a field's value changes, is not set on focus, and stays set after reverting to the initial value
- Add `path` property to internal field stores so the path no longer needs to be reconstructed from the stringified `name`
- Change `walkFieldStore` utility to allow the callback to stop the walk early by returning `true` and to return whether the walk was stopped
- Fix `resetItemState` to keep a non-nullish array, object or tuple consistent with its initial state instead of `undefined` when its input is omitted (issue #139)

## v0.8.0 (June 15, 2026)

- Add `focusFieldElement` utility that focuses the first focusable element of a field store
- Fix `setFieldBool` to set the boolean property on object field stores themselves, not only on their children
- Fix `setInitialFieldInput` to update the initial input instead of the current input of array and object field stores, so resetting nullish arrays and objects to a new initial input works
- Fix `resetItemState` to initialize missing array children, so resetting an item whose nested array grew beyond its existing field stores no longer leaves items without a child store
- Fix `resetItemState`, `setFieldInput` and `setInitialFieldInput` to keep tuple field stores at their fixed length instead of growing them for a longer input, which previously threw
- Fix `resetItemState` to keep `initialElements` in sync with `elements` while a field owns its element array, so a later reset restores the field's live element after a replaced or remounted field re-registers
- Change `ValidArrayPath` to reject fixed-length tuples, so field array methods only accept dynamic array paths
- Fix `setFieldInput` to clear stale state from reused child stores when an array grows after shrinking, without losing their dirty baseline so a changed value is still detected as dirty
- Fix `decodeFormData` to complete missing trailing tuple items, so unchecked checkboxes and absent arrays at the end of tuples are restored
- Fix `decodeFormData` to preserve a decoded `null` for nullable booleans instead of coercing it to `false`
- Fix `validateFormInput` to focus the first erroring field whose element can actually receive focus, so the focus is no longer consumed by a field without a focusable element (e.g. unmounted, disabled or hidden)
- Fix `validateFormInput` to always reset the validating state, even if schema parsing throws

## v0.7.0 (May 24, 2026)

- Add `FormSchema` type that constrains a form's root schema to object schemas (sync or async) and combinators (`intersect`, `union`, `variant`)
- Add `getDirtyFieldInput` to extract only the dirty input of a field store (issue #21, pull request #98)
- Change `FormConfig`, `InternalFormStore`, `BaseFormStore`, `SubmitHandler` and `SubmitEventHandler` generic constraints from `Schema` to `FormSchema`

## v0.6.4 (May 17, 2026)

- Fix `initializeFieldStore` to throw an error when `variant` or `union` branches initialize the same key with incompatible store kinds (pull request #94)
- Fix `ValidArrayPath` type to accept array fields reachable through unions (`variant` options, optional/nullish intermediates, and unions that include primitives) (pull request #89)
- Fix `PathValue` type to preserve `| undefined` when navigating to optional or nullish fields, so input types of methods like `setInput` are no longer narrowed away from `T | null | undefined` (issue #15, pull request #89)

## v0.6.3 (March 06, 2026)

- Fix `initializeFieldStore` for nullable and nullish `lazy`, `variant`, `union` and `intersect` schemas (pull request #68)

## v0.6.2 (February 10, 2026)

- Fix `PartialValues` type for array items

## v0.6.1 (February 09, 2026)

- Fix `DeepPartial` and `PartialValues` types for arrays

## v0.6.0 (February 05, 2026)

- Split submit handler types into `SubmitHandler` (no event) and `SubmitEventHandler` (with event)

## v0.5.0 (January 31, 2026)

- Add React-specific `SubmitHandler` type using `FormEvent` type from React
- Rename `vanilla` build target in favor of dedicated `react` target

## v0.4.5 (December 12, 2025)

- Fix `initialInput` passed to `initializeFieldStore` for nullish wrapper schemas (pull request #48)

## v0.4.4 (December 11, 2025)

- Fix `setFieldInput` not setting input if path is empty array (issue #46)

## v0.4.3 (November 29, 2025)

- Fix radio button value handling in `getElementInput` (pull request #39)

## v0.4.2 (November 25, 2025)

- Fix `isDirty` to handle `null` like `undefined` for empty string and `NaN` comparisons (pull request #40)

## v0.4.1 (October 27, 2025)

- Fix bug when setting array input with more array items than previous state (pull request #29)

## v0.4.0 (September 22, 2025)

- Add new `initialElements` state to `InternalBaseStore` interface and update `initializeFieldStore`
- Change interfaces of `InternalFieldStore` to support `null` and `undefined` values for arrays and objects (issue #15)
- Fix bug in `copyItemState`, `resetItemState` and `swapItemState` by including `elements` and `errors` state

## v0.3.1 (September 13, 2025)

- Fix `setFieldInput` and `setInitialFieldInput` for nullish arrays and objects (issue #15)

## v0.3.0 (August 17, 2025)

- Change implementation of `setFieldInput` to set `isTouched` to `true`
- Fix `PathValue`, `ValidPath` and `ValidArrayPath` for optional properties (issue #13)

## v0.2.0 (July 27, 2025)

- Change name of `validate` method to `parse` in internal form store
- Change name of `validateOn` config to `validate` in internal form store
- Change name of `revalidateOn` config to `revalidate` in internal form store
- Fix bug in `resetItemState` by also resetting `.errors` signals

## v0.1.0 (July 14, 2025)

- Initial release
