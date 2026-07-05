// Ported from .base-ui/packages/react/src/radio-group/RadioGroupContext.ts. Provided by a
// <RadioGroup>; a standalone <Radio.Root> reads undefined and self-manages `checked`.
import { createContext, useContext } from 'octane';

import type { FieldValidation } from './field/FieldRootContext';

export interface RadioGroupContextValue<Value = any> {
	disabled: boolean | undefined;
	readOnly: boolean | undefined;
	required: boolean | undefined;
	form: string | undefined;
	name: string | undefined;
	checkedValue: Value | undefined;
	setCheckedValue: (value: Value, eventDetails: any) => void;
	touched: boolean;
	setTouched: (next: boolean | ((prev: boolean) => boolean)) => void;
	validation?: FieldValidation | undefined;
	registerControlRef: (element: HTMLElement | null, disabled?: boolean) => void;
	registerInputRef: (element: HTMLInputElement | null) => void;
	[key: string]: any;
}

export const RadioGroupContext = createContext<RadioGroupContextValue | undefined>(undefined);

export function useRadioGroupContext(): RadioGroupContextValue | undefined {
	return useContext(RadioGroupContext);
}
