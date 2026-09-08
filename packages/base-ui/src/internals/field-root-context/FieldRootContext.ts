/** @jsxImportSource octane */
import { mergeProps } from '../../merge-props';
import type { WithBaseUIEvent } from '../types';
('use client');
import * as React from 'octane';
import { EMPTY_OBJECT } from '@octanejs/base-ui-utils/empty';
import { NOOP } from '../noop';
import { DEFAULT_FIELD_ROOT_STATE, DEFAULT_VALIDITY_STATE } from '../field-constants/constants';
import type { FieldValidityData, FieldRootState } from '../../field/root/FieldRoot.tsrx';
import type { Form } from '../../form';
import type { UseFieldValidationReturnValue } from '../../field/root/useFieldValidation';
import type { HTMLProps } from '../types';
import type { FieldControlRegistration } from '../field-register-control/useFieldControlRegistration';

export interface FieldRootContext {
	invalid: boolean | undefined;
	name: string | undefined;
	validityData: FieldValidityData;
	setValidityData: React.Dispatch<React.SetStateAction<FieldValidityData>>;
	disabled: boolean | undefined;
	setTouched: React.Dispatch<React.SetStateAction<boolean>>;
	setDirty: React.Dispatch<React.SetStateAction<boolean>>;
	setFilled: React.Dispatch<React.SetStateAction<boolean>>;
	setFocused: React.Dispatch<React.SetStateAction<boolean>>;
	validationMode: Form.ValidationMode;
	shouldValidateOnChange: () => boolean;
	state: FieldRootState;
	registerFieldControl: (
		source: symbol,
		registration: FieldControlRegistration | undefined,
	) => void;
	validation: UseFieldValidationReturnValue;
}

export const DEFAULT_FIELD_ROOT_CONTEXT: FieldRootContext = {
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
	setTouched: NOOP,
	setDirty: NOOP,
	setFilled: NOOP,
	setFocused: NOOP,
	validationMode: 'onSubmit',
	shouldValidateOnChange: () => false,
	state: DEFAULT_FIELD_ROOT_STATE,
	registerFieldControl: NOOP,
	validation: {
		getValidationProps: (_disabled: boolean, props: WithBaseUIEvent<HTMLProps> = EMPTY_OBJECT) =>
			mergeProps(undefined, props),
		inputRef: { current: null },
		registeredInputs: new Map(),
		registerInput: NOOP,
		getInputControl: () => null,
		commit: async () => {},
		change: NOOP,
	},
};

export const FieldRootContext = React.createContext<FieldRootContext>(DEFAULT_FIELD_ROOT_CONTEXT);

export function useFieldRootContext(optional = true) {
	const context = React.useContext(FieldRootContext);

	if (context.setValidityData === NOOP && !optional) {
		throw new Error(
			'Base UI: FieldRootContext is missing. Field parts must be placed within <Field.Root>.',
		);
	}

	return context;
}
