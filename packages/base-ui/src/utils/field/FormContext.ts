// Ported from .base-ui/packages/react/src/internals/form-context/FormContext.ts. A <Form>
// provides error state + a field registry; standalone controls read the default (no errors,
// noop clearErrors).
import { createContext, useContext } from 'octane';

import { NOOP } from '../noop';
import type { FieldValidityData, FormValidationMode } from './constants';

export type Errors = Record<string, string | string[]>;

export interface FormFieldEntry {
	name: string | undefined;
	validate: () => void;
	validityData: FieldValidityData;
	controlRef: { current: HTMLElement | null };
	getValue: () => unknown;
}

export interface FormContextValue {
	errors: Errors;
	clearErrors: (name: string | undefined) => void;
	formRef: { current: { fields: Map<string, FormFieldEntry> } };
	validationMode: FormValidationMode;
	submitAttemptedRef: { current: boolean };
}

export const FormContext = createContext<FormContextValue>({
	formRef: { current: { fields: new Map() } },
	errors: {},
	clearErrors: NOOP,
	validationMode: 'onSubmit',
	submitAttemptedRef: { current: false },
});

export function useFormContext(): FormContextValue {
	return useContext(FormContext);
}
