# Changelog

All notable changes to the library will be documented in this file.

## v1.0.0-rc.0 (June 23, 2026)

- Release candidate for v1.0.0
- Change `@formisch/core` to v1.0.0-rc.0

## v0.11.0 (June 22, 2026)

- Change `@formisch/core` to v0.10.0
- Change `insert`, `replace` and `reset` methods to initialize required fields without an input using the form's `emptyInput` config

## v0.10.0 (June 21, 2026)

- Change `@formisch/core` to v0.9.0
- Add `keepEdited` config option to the `reset` method to keep the edited state of fields
- Rename `getAllErrors` method to `getDeepErrors` and add an optional `path` config to scope error collection to a specific field's subtree (issue #135)
- Add `getDeepErrorEntries` method to retrieve the errors of a form or specific field as a list of path and message entries (issue #135)
- Add `isValid`, `isDirty`, `isTouched` and `isEdited` methods to check whether a form or a specific field is valid, dirty, touched or edited
- Change `insert`, `move`, `remove`, `replace` and `swap` methods to set the edited state of the field array
- Fix `replace` and `insert` to keep a non-nullish array, object or tuple consistent with the initial form state instead of `undefined` when its key is omitted (issue #139)

## v0.9.0 (June 15, 2026)

- Change `@formisch/core` to v0.8.0
- Fix `reset` method to apply a new `initialInput` to nullish array and object fields
- Fix `insert` and `replace` methods to no longer crash when an item's initial input contains a nested array with more items than the existing field stores
- Fix `setInput` method so growing an array after it was shrunk no longer resurfaces stale state from removed items and still detects changed values as dirty
- Change field array methods to reject fixed-length tuple paths at the type level, since a tuple's fixed arity makes operations like `insert` and `remove` invalid
- Fix `focus` method to focus the first element that can actually receive focus, skipping detached, disabled or hidden elements
- Fix `validate` and `handleSubmit` methods to focus the first field with an error and a focusable element, and to reset the validating state if validation throws

## v0.8.0 (May 24, 2026)

- Add `pickDirty` method to filter an externally-supplied value down to its dirty parts using the form's dirty mask (issue #21, pull request #98)
- Add `getDirtyPaths` method to list the paths of dirty fields in a form or specific field (issue #21, pull request #98)
- Add `getDirtyInput` method to retrieve only the dirty input values of a form or specific field (issue #21, pull request #98)
- Change `@formisch/core` to v0.7.0
- Change method generic constraints from `Schema` to `FormSchema` so the form root must be an object schema (sync or async) or a combinator (`intersect`, `union`, `variant`)

## v0.7.2 (May 17, 2026)

- Change `@formisch/core` to v0.6.4
- Fix `reset` method to apply falsy and explicit `undefined` values when resetting the initial input of a specific field (issue #78)

## v0.7.1 (April 16, 2026)

- Fix `insert` method to initialize missing target child slots when shifting array items (pull request #76)
- Fix `getAllErrors` to be reactive when items are dynamically added to a `FieldArray`

## v0.7.0 (February 05, 2026)

- Align `handleSubmit` overloads with separate `SubmitHandler` and `SubmitEventHandler` types

## v0.6.0 (January 31, 2026)

- Add React-specific `handleSubmit` method using `FormEvent` type from React
- Add React-specific `setInput` method with change event validation
- Rename `vanilla` build target in favor of dedicated `react` target

## v0.5.2 (December 11, 2025)

- Change `@formisch/core` to v0.4.4

## v0.5.1 (November 28, 2025)

- Fix return type of `handleSubmit` method to return a function that returns a Promise (issue #41)

## v0.5.0 (November 25, 2025)

- Add support for returning error messages of normal objects in `handleSubmit` method (pull request #11)
- Fix `isDirty` in `reset` to handle `null` like `undefined` for empty string and `NaN` comparisons (pull request #40)

## v0.4.1 (October 31, 2025)

- Fix bug in `move` method that corrupted item state when moving array items

## v0.4.0 (October 27, 2025)

- Fix `focus` method to accept `form` as first parameter

## v0.3.0 (September 22, 2025)

- Change `@formisch/core` to v0.4.0
- Fix bug with `elements` state by resetting it to `initialElements` state

## v0.2.0 (July 27, 2025)

- Add `handleSubmit` method for form submission handling

## v0.1.0 (July 14, 2025)

- Initial release
