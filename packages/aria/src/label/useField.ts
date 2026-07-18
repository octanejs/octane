// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/label/useField.ts).
import type { DOMAttributes, HelpTextProps, Validation } from '@react-types/shared';

import { S, splitSlot, subSlot } from '../internal';
import { LabelAria, LabelAriaProps, useLabel } from './useLabel';
import { mergeProps } from '../utils/mergeProps';
import { useSlotId } from '../utils/useId';

export interface AriaFieldProps
	extends LabelAriaProps, HelpTextProps, Omit<Validation<any>, 'isRequired'> {}

export interface FieldAria extends LabelAria {
	/** Props for the description element, if any. */
	descriptionProps: DOMAttributes;
	/** Props for the error message element, if any. */
	errorMessageProps: DOMAttributes;
}

/**
 * Provides the accessibility implementation for input fields. Fields accept user input, gain
 * context from their label, and may display a description or error message.
 *
 * @param props - Props for the Field.
 */
export function useField(props: AriaFieldProps): FieldAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useField(props: AriaFieldProps, slot: symbol | undefined): FieldAria;
export function useField(...args: any[]): FieldAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useField');
	const props = user[0] as AriaFieldProps;

	let { description, errorMessage, isInvalid, validationState } = props;
	let { labelProps, fieldProps } = useLabel(props, subSlot(slot, 'label'));

	let descriptionId = useSlotId(
		[Boolean(description), Boolean(errorMessage), isInvalid, validationState],
		subSlot(slot, 'descriptionId'),
	);
	let errorMessageId = useSlotId(
		[Boolean(description), Boolean(errorMessage), isInvalid, validationState],
		subSlot(slot, 'errorMessageId'),
	);

	fieldProps = mergeProps(fieldProps, {
		'aria-describedby':
			[
				descriptionId,
				// Use aria-describedby for error message because aria-errormessage is unsupported using VoiceOver or NVDA. See https://github.com/adobe/react-spectrum/issues/1346#issuecomment-740136268
				errorMessageId,
				props['aria-describedby'],
			]
				.filter(Boolean)
				.join(' ') || undefined,
	});

	return {
		labelProps,
		fieldProps,
		descriptionProps: {
			id: descriptionId,
		},
		errorMessageProps: {
			id: errorMessageId,
		},
	};
}
