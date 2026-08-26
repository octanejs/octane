# Changelog

All notable changes to the library will be documented in this file.

## v1.0.0-rc.0 (June 23, 2026)

- Release candidate for v1.0.0
- Change `@formisch/core` to v1.0.0-rc.0
- Change `@formisch/methods` to v1.0.0-rc.0

## v0.8.0 (June 22, 2026)

- Change `@formisch/core` to v0.10.0
- Change `@formisch/methods` to v0.11.0
- Add `emptyInput` config to define the value a required field of a given type starts at when no initial input is provided

## v0.7.0 (June 21, 2026)

- Change `@formisch/core` to v0.9.0
- Change `@formisch/methods` to v0.10.0
- Add `isEdited` property to the field, field array and form stores

## v0.6.0 (June 15, 2026)

- Change `@formisch/core` to v0.8.0
- Change `@formisch/methods` to v0.9.0
- Fix `useField` so resetting a field that was unmounted and remounted targets its live element for focus and file reset instead of a stale one

## v0.5.0 (May 24, 2026)

- Change `@formisch/core` to v0.7.0
- Change `@formisch/methods` to v0.8.0
- Change `useForm`, `useField`, `useFieldArray`, `Form`, `Field`, `FieldArray` and related types to constrain the form root to `FormSchema` (object schema or combinator)

## v0.4.6 (May 17, 2026)

- Change `@formisch/core` to v0.6.4
- Change `@formisch/methods` to v0.7.2

## v0.4.5 (April 16, 2026)

- Change `@formisch/methods` to v0.7.1

## v0.4.4 (March 19, 2026)

- Fix `Form` component submit handler type inference

## v0.4.3 (March 06, 2026)

- Change `@formisch/core` to v0.6.3

## v0.4.2 (February 10, 2026)

- Change `@formisch/core` to v0.6.2

## v0.4.1 (February 09, 2026)

- Change `@formisch/core` to v0.6.1

## v0.4.0 (February 05, 2026)

- Change `@formisch/core` to v0.6.0
- Change `@formisch/methods` to v0.7.0
- Update `Form` component submit handler types

## v0.3.0 (January 31, 2026)

- Add `onChange` method to `FieldStore` for programmatic input value setting
- Change `@formisch/core` to v0.5.0
- Change `@formisch/methods` to v0.6.0
- Change imports from `@formisch/core/vanilla` to `@formisch/core/react`
- Change imports from `@formisch/methods/vanilla` to `@formisch/methods/react`

## v0.2.2 (December 12, 2025)

- Change `@formisch/core` to v0.4.5

## v0.2.1 (December 11, 2025)

- Change `@formisch/core` to v0.4.4
- Change `@formisch/methods` to v0.5.2

## v0.2.0 (December 04, 2025)

- Add cleanup logic in `useSignals` to remove subscribers on unmount
- Refactor `useForm`, `useField` and `useFieldArray` to use `useMemo` for better performance

## v0.1.0 (December 03, 2025)

- Initial release
