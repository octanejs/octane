// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/checkbox/utils.ts).
import type { CheckboxGroupState } from '../stately/checkbox/useCheckboxGroupState';

interface CheckboxGroupData {
	name?: string;
	form?: string;
	descriptionId?: string;
	errorMessageId?: string;
	validationBehavior: 'aria' | 'native';
}

export const checkboxGroupData: WeakMap<CheckboxGroupState, CheckboxGroupData> = new WeakMap<
	CheckboxGroupState,
	CheckboxGroupData
>();
