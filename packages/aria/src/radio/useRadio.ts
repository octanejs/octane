// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/radio/useRadio.ts).
// octane adaptations:
// - onChange→onInput DOM wiring (octane has no synthetic onChange; native `input` fires
//   on radio selection with identical timing) — the selection handler is `onInput` and
//   reads state off the native event.
// - `FocusableProps` is the ported native-event version; label handlers receive native
//   MouseEvents; ReactNode → any; per-element attribute types → structural bags.
// - The dev-only missing-label console.warn is not ported (repo policy).
// - Public-hook slot threading.
import type { AriaLabelingProps, DOMProps, PressEvents, RefObject } from '@react-types/shared';
import { useMemo } from 'octane';

import type { FocusableProps } from '../interactions/useFocusable';
import { S, splitSlot, subSlot } from '../internal';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { radioGroupData } from './utils';
import type { RadioGroupState } from '../stately/radio/useRadioGroupState';
import { useFocusable } from '../interactions/useFocusable';
import { useFormReset } from '../utils/useFormReset';
import { useFormValidation } from '../form/useFormValidation';
import { usePress } from '../interactions/usePress';
import { useSlotId2 } from '../utils/useSlot';

type DOMAttributes = Record<string, any>;

export interface RadioProps extends FocusableProps {
	/**
	 * The value of the radio button, used when submitting an HTML form.
	 * See [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/radio#Value).
	 */
	value: string;
	/**
	 * The label for the Radio. Accepts any renderable node.
	 */
	children?: any;
	/**
	 * Whether the radio button is disabled or not.
	 * Shows that a selection exists, but is not available in that circumstance.
	 */
	isDisabled?: boolean;
}

export interface AriaRadioProps
	extends RadioProps, DOMProps, AriaLabelingProps, Omit<PressEvents, 'onClick'> {
	/** Handler called on the native click event (octane native MouseEvent). */
	onClick?: (e: MouseEvent) => void;
}

export interface RadioAria {
	/** Props for the label wrapper element. */
	labelProps: DOMAttributes;
	/** Props for the input element. */
	inputProps: DOMAttributes;
	/** Props for the checkbox description element, if any. */
	descriptionProps: DOMAttributes;
	/** Whether the radio is disabled. */
	isDisabled: boolean;
	/** Whether the radio is currently selected. */
	isSelected: boolean;
	/** Whether the radio is in a pressed state. */
	isPressed: boolean;
}

export function useRadio(
	props: AriaRadioProps,
	state: RadioGroupState,
	ref: RefObject<HTMLInputElement | null>,
): RadioAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useRadio(
	props: AriaRadioProps,
	state: RadioGroupState,
	ref: RefObject<HTMLInputElement | null>,
	slot: symbol | undefined,
): RadioAria;
export function useRadio(...args: any[]): RadioAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useRadio');
	const props = user[0] as AriaRadioProps;
	const state = user[1] as RadioGroupState;
	const ref = user[2] as RefObject<HTMLInputElement | null>;

	let {
		value,
		'aria-label': ariaLabel,
		'aria-labelledby': ariaLabelledby,
		onPressStart,
		onPressEnd,
		onPressChange,
		onPress,
		onPressUp,
		onClick,
	} = props;
	const isDisabled = props.isDisabled || state.isDisabled;

	let checked = state.selectedValue === value;

	// octane adaptation: native `input` fires on radio selection — same timing as React's
	// synthetic onChange for radios.
	let onInput = (e: Event) => {
		e.stopPropagation();
		state.setSelectedValue(value);
	};

	// Handle press state for keyboard interactions and cases where labelProps is not used.
	let { pressProps, isPressed } = usePress(
		{
			onPressStart,
			onPressEnd,
			onPressChange,
			onPress,
			onPressUp,
			onClick,
			isDisabled,
		},
		subSlot(slot, 'press'),
	);

	// Handle press state on the label.
	let { pressProps: labelProps, isPressed: isLabelPressed } = usePress(
		{
			onPressStart,
			onPressEnd,
			onPressChange,
			onPressUp,
			onClick,
			isDisabled,
			onPress(e: any) {
				onPress?.(e);
				state.setSelectedValue(value);
				ref.current?.focus();
			},
		},
		subSlot(slot, 'labelPress'),
	);

	let { focusableProps } = useFocusable(
		mergeProps(props, {
			onFocus: () => state.setLastFocusedValue(value),
		}),
		ref,
		subSlot(slot, 'focusable'),
	);
	let interactions = mergeProps(pressProps, focusableProps);
	let domProps = filterDOMProps(props, { labelable: true });
	let tabIndex: number | undefined = -1;
	if (state.selectedValue != null) {
		if (state.selectedValue === value) {
			tabIndex = 0;
		}
	} else if (state.lastFocusedValue === value || state.lastFocusedValue == null) {
		tabIndex = 0;
	}
	if (isDisabled) {
		tabIndex = undefined;
	}

	let { name, form, descriptionId, errorMessageId, validationBehavior } =
		radioGroupData.get(state)!;
	useFormReset(ref, state.defaultSelectedValue, state.setSelectedValue, subSlot(slot, 'reset'));
	useFormValidation({ validationBehavior }, state, ref, subSlot(slot, 'validation'));

	let descriptionProps = useSlotId2(undefined, subSlot(slot, 'description'));

	return {
		labelProps: mergeProps(
			labelProps,
			useMemo(
				() => ({
					onClick: (e: MouseEvent) => e.preventDefault(),
					// Prevent label from being focused when mouse down on it.
					// Note, this does not prevent the input from being focused in the `click` event.
					onMouseDown: (e: MouseEvent) => e.preventDefault(),
				}),
				[],
				subSlot(slot, 'labelHandlers'),
			),
		),
		inputProps: mergeProps(domProps, {
			...interactions,
			type: 'radio',
			name,
			form,
			tabIndex,
			disabled: isDisabled,
			required: state.isRequired && validationBehavior === 'native',
			checked,
			value,
			onInput,
			'aria-describedby':
				[
					props['aria-describedby'],
					descriptionProps.id,
					state.isInvalid ? errorMessageId : null,
					descriptionId,
				]
					.filter(Boolean)
					.join(' ') || undefined,
		}),
		descriptionProps,
		isDisabled,
		isSelected: checked,
		isPressed: isPressed || isLabelPressed,
	};
}
