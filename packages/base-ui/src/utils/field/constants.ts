// Ported from .base-ui/packages/react/src/internals/field-constants/constants.ts and the
// FieldRootState/FieldValidityData types (field/root/FieldRoot). The default field state +
// validity, plus the shared `fieldValidityMapping` (valid → data-valid / data-invalid; null →
// no attribute) reused by every field-aware control's stateAttributesMapping.
import type { StateAttributesMapping } from '../getStateAttributesProps';

export type FormValidationMode = 'onSubmit' | 'onBlur' | 'onChange';

export interface FieldRootState {
	disabled: boolean;
	touched: boolean;
	dirty: boolean;
	filled: boolean;
	focused: boolean;
	valid: boolean | null;
}

export interface FieldValidityState {
	badInput: boolean;
	customError: boolean;
	patternMismatch: boolean;
	rangeOverflow: boolean;
	rangeUnderflow: boolean;
	stepMismatch: boolean;
	tooLong: boolean;
	tooShort: boolean;
	typeMismatch: boolean;
	valid: boolean | null;
	valueMissing: boolean;
}

export interface FieldValidityData {
	state: FieldValidityState;
	errors: string[];
	error: string;
	value: unknown;
	initialValue: unknown;
}

export const DEFAULT_VALIDITY_STATE: FieldValidityState = {
	badInput: false,
	customError: false,
	patternMismatch: false,
	rangeOverflow: false,
	rangeUnderflow: false,
	stepMismatch: false,
	tooLong: false,
	tooShort: false,
	typeMismatch: false,
	valid: null,
	valueMissing: false,
};

export const DEFAULT_FIELD_STATE_ATTRIBUTES: Pick<
	FieldRootState,
	'valid' | 'touched' | 'dirty' | 'filled' | 'focused'
> = {
	valid: null,
	touched: false,
	dirty: false,
	filled: false,
	focused: false,
};

export const DEFAULT_FIELD_ROOT_STATE: FieldRootState = {
	disabled: false,
	...DEFAULT_FIELD_STATE_ATTRIBUTES,
};

export const fieldValidityMapping: StateAttributesMapping<{ valid: boolean | null }> = {
	valid(value: boolean | null): Record<string, string> | null {
		if (value === null) {
			return null;
		}
		if (value) {
			return { 'data-valid': '' };
		}
		return { 'data-invalid': '' };
	},
};
