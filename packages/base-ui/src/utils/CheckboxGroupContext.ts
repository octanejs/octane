// Ported from .base-ui/packages/react/src/checkbox-group/CheckboxGroupContext.ts. Provided by
// a <CheckboxGroup>; `useCheckboxGroupContext()` returns undefined for a standalone checkbox.
// The full CheckboxGroup + parent-checkbox machinery lands with CheckboxGroup — the `parent`
// surface is typed loosely here.
import { createContext, useContext } from 'octane';

import type { FieldValidation } from './field/FieldRootContext';

export interface CheckboxGroupContextValue {
	value: string[] | undefined;
	defaultValue: string[] | undefined;
	setValue: (value: string[], eventDetails: any) => void;
	allValues: string[] | undefined;
	parent: any;
	disabled: boolean;
	validation: FieldValidation;
	registerControlRef: (element: HTMLButtonElement | null) => void;
}

export const CheckboxGroupContext = createContext<CheckboxGroupContextValue | undefined>(undefined);

export function useCheckboxGroupContext(optional = true): CheckboxGroupContextValue | undefined {
	const context = useContext(CheckboxGroupContext);
	if (context === undefined && !optional) {
		throw new Error(
			'Base UI: CheckboxGroupContext is missing. CheckboxGroup parts must be placed within <CheckboxGroup>.',
		);
	}
	return context;
}
