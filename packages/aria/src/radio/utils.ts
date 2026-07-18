// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/radio/utils.ts).
import type { RadioGroupState } from '../stately/radio/useRadioGroupState';

interface RadioGroupData {
	name: string;
	form: string | undefined;
	descriptionId: string | undefined;
	errorMessageId: string | undefined;
	validationBehavior: 'aria' | 'native';
}

export const radioGroupData: WeakMap<RadioGroupState, RadioGroupData> = new WeakMap<
	RadioGroupState,
	RadioGroupData
>();
