// Ported from .base-ui/packages/react/src/internals/field-root-context/FieldRootContext.ts.
// A <Field.Root> provides validity/touched/dirty/etc. state + a validation object; standalone
// controls read `DEFAULT_FIELD_ROOT_CONTEXT` (inert validation, noop setters). `useFieldRootContext`
// detects "no provider" via `setValidityData === NOOP`.
import { createContext, useContext } from 'octane';

import { NOOP } from '../noop';
import {
	DEFAULT_FIELD_ROOT_STATE,
	DEFAULT_FIELD_STATE_ATTRIBUTES,
	DEFAULT_VALIDITY_STATE,
	type FieldRootState,
	type FieldValidityData,
	type FormValidationMode,
} from './constants';

export interface FieldValidation {
	getValidationProps: (disabled: boolean, props?: Record<string, any>) => Record<string, any>;
	inputRef: { current: HTMLInputElement | null };
	registerInput: (...args: any[]) => void;
	commit: (value: unknown) => Promise<void>;
	change: (value: unknown) => void;
}

export interface FieldRootContextValue {
	invalid: boolean | undefined;
	name: string | undefined;
	validityData: FieldValidityData;
	setValidityData: (next: any) => void;
	disabled: boolean | undefined;
	touched: boolean;
	setTouched: (next: any) => void;
	dirty: boolean;
	setDirty: (next: any) => void;
	filled: boolean;
	setFilled: (next: any) => void;
	focused: boolean;
	setFocused: (next: any) => void;
	validate: (
		value: unknown,
		formValues: Record<string, unknown>,
	) => string | string[] | null | Promise<string | string[] | null>;
	validationMode: FormValidationMode;
	validationDebounceTime: number;
	shouldValidateOnChange: () => boolean;
	state: FieldRootState;
	markedDirtyRef: { current: boolean };
	registerFieldControl: (source: symbol, registration: any) => void;
	validation: FieldValidation;
}

export const DEFAULT_FIELD_ROOT_CONTEXT: FieldRootContextValue = {
	invalid: undefined,
	name: undefined,
	validityData: {
		state: DEFAULT_VALIDITY_STATE,
		errors: [],
		error: '',
		value: '',
		initialValue: null,
	},
	setValidityData: NOOP,
	disabled: undefined,
	touched: DEFAULT_FIELD_STATE_ATTRIBUTES.touched,
	setTouched: NOOP,
	dirty: DEFAULT_FIELD_STATE_ATTRIBUTES.dirty,
	setDirty: NOOP,
	filled: DEFAULT_FIELD_STATE_ATTRIBUTES.filled,
	setFilled: NOOP,
	focused: DEFAULT_FIELD_STATE_ATTRIBUTES.focused,
	setFocused: NOOP,
	validate: () => null,
	validationMode: 'onSubmit',
	validationDebounceTime: 0,
	shouldValidateOnChange: () => false,
	state: DEFAULT_FIELD_ROOT_STATE,
	markedDirtyRef: { current: false },
	registerFieldControl: NOOP,
	validation: {
		getValidationProps: (_disabled: boolean, props: Record<string, any> = {}) => props,
		inputRef: { current: null },
		registerInput: NOOP,
		commit: async () => {},
		change: NOOP,
	},
};

export const FieldRootContext = createContext<FieldRootContextValue>(DEFAULT_FIELD_ROOT_CONTEXT);

export function useFieldRootContext(optional = true): FieldRootContextValue {
	const context = useContext(FieldRootContext);
	if (context.setValidityData === NOOP && !optional) {
		throw new Error(
			'Base UI: FieldRootContext is missing. Field parts must be placed within <Field.Root>.',
		);
	}
	return context;
}
