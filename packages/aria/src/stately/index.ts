// @octanejs/aria/stately — the `react-stately` surface, ported onto octane. Exports mirror
// the upstream monopackage exports (.react-spectrum/packages/react-stately/exports/) and
// grow area-by-area with the migration plan (docs/aria-migration-plan.md).

// utils
export { useControlledState } from './utils/useControlledState';
export type { SetStateAction } from './utils/useControlledState';

// toggle
export { useToggleState } from './toggle/useToggleState';
export { useToggleGroupState } from './toggle/useToggleGroupState';
export type { ToggleProps, ToggleState, ToggleStateOptions } from './toggle/useToggleState';
export type { ToggleGroupProps, ToggleGroupState } from './toggle/useToggleGroupState';

// checkbox
export { useCheckboxGroupState } from './checkbox/useCheckboxGroupState';
export type { CheckboxGroupProps, CheckboxGroupState } from './checkbox/useCheckboxGroupState';

// radio
export { useRadioGroupState } from './radio/useRadioGroupState';
export type { RadioGroupProps, RadioGroupState } from './radio/useRadioGroupState';

// searchfield
export { useSearchFieldState } from './searchfield/useSearchFieldState';
export type { SearchFieldProps, SearchFieldState } from './searchfield/useSearchFieldState';

// disclosure
export { useDisclosureState } from './disclosure/useDisclosureState';
export { useDisclosureGroupState } from './disclosure/useDisclosureGroupState';
export type { DisclosureProps, DisclosureState } from './disclosure/useDisclosureState';
export type {
	DisclosureGroupProps,
	DisclosureGroupState,
} from './disclosure/useDisclosureGroupState';

// form — mirrors the @react-stately/form shim surface.
export {
	FormValidationContext,
	useFormValidationState,
	DEFAULT_VALIDATION_RESULT,
	VALID_VALIDITY_STATE,
	privateValidationStateProp,
	mergeValidation,
} from './form/useFormValidationState';
export type { FormValidationState } from './form/useFormValidationState';
