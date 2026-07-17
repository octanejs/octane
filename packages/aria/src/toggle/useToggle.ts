// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/toggle/useToggle.ts).
// octane adaptations:
// - `react-stately/*` imports → the ported `../stately/*` modules.
// - DOM wiring uses octane's native `onInput` prop instead of React's synthetic `onChange`
//   (for checkbox-type inputs the native `input` event fires on every toggle, matching the
//   upstream timing); `React.ChangeEvent` reads become the native event via
//   `getEventTarget`. Public value-level `onChange` callbacks are unchanged.
// - React's `LabelHTMLAttributes`/`InputHTMLAttributes`/`DOMAttributesWithRef` prop-bag
//   types → a local structural `DOMAttributes` (octane native event props).
// - The dev-only "you must specify an aria-label" console.warn (and the locals that only
//   fed it) is not ported (repo policy: no dev-only console warnings).
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention.
import type {
	AriaLabelingProps,
	AriaValidationProps,
	FocusableDOMProps,
	InputDOMProps,
	PressEvents,
	RefObject,
	ValidationResult,
} from '@react-types/shared';
import { useState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { filterDOMProps } from '../utils/filterDOMProps';
import { getEventTarget } from '../utils/shadowdom/DOMFunctions';
import { mergeProps } from '../utils/mergeProps';
import {
	privateValidationStateProp,
	useFormValidationState,
} from '../stately/form/useFormValidationState';
import type { ToggleProps, ToggleState } from '../stately/toggle/useToggleState';
import { useFocusable } from '../interactions/useFocusable';
import { useFormReset } from '../utils/useFormReset';
import { useFormValidation } from '../form/useFormValidation';
import { usePress } from '../interactions/usePress';
import { useSlotId2 } from '../utils/useSlot';

// octane adaptation: minimal structural prop bag (upstream's drags React attribute types).
type DOMAttributes = Record<string, any>;

export interface AriaToggleProps
	extends
		ToggleProps,
		FocusableDOMProps,
		AriaLabelingProps,
		AriaValidationProps,
		InputDOMProps,
		Omit<PressEvents, 'onClick'> {
	/**
	 * **Not recommended – use `onPress` instead.** octane adaptation: native MouseEvent
	 * (upstream's `PressEvents.onClick` is typed over React's synthetic event).
	 */
	onClick?: (e: MouseEvent) => void;
	/**
	 * Identifies the element (or elements) whose contents or presence are controlled by the current
	 * element.
	 */
	'aria-controls'?: string;
}

export interface ToggleAria extends ValidationResult {
	/** Props to be spread on the label element. */
	labelProps: DOMAttributes;
	/** Props to be spread on the input element. */
	inputProps: DOMAttributes;
	/** Props for the checkbox description element, if any. */
	descriptionProps: DOMAttributes;
	/** Props for the checkbox error message element, if any. */
	errorMessageProps: DOMAttributes;
	/** Whether the toggle is selected. */
	isSelected: boolean;
	/** Whether the toggle is in a pressed state. */
	isPressed: boolean;
	/** Whether the toggle is disabled. */
	isDisabled: boolean;
	/** Whether the toggle is read only. */
	isReadOnly: boolean;
	/** Whether the toggle is invalid. */
	isInvalid: boolean;
}

/**
 * Handles interactions for toggle elements, e.g. Checkboxes and Switches.
 */
export function useToggle(
	props: AriaToggleProps,
	state: ToggleState,
	ref: RefObject<HTMLInputElement | null>,
): ToggleAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useToggle(
	props: AriaToggleProps,
	state: ToggleState,
	ref: RefObject<HTMLInputElement | null>,
	slot: symbol | undefined,
): ToggleAria;
export function useToggle(...args: any[]): ToggleAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useToggle');
	const props = user[0] as AriaToggleProps;
	const state = user[1] as ToggleState;
	const ref = user[2] as RefObject<HTMLInputElement | null>;

	let {
		isDisabled = false,
		isReadOnly = false,
		value,
		name,
		form,
		isRequired,
		validationBehavior = 'aria',
		'aria-describedby': ariaDescribedby,
		onPressStart,
		onPressEnd,
		onPressChange,
		onPress,
		onPressUp,
		onClick,
	} = props;

	// Create validation state here because it doesn't make sense to add to general useToggleState.
	let validationState = useFormValidationState(
		{ ...props, value: state.isSelected },
		subSlot(slot, 'validation'),
	);
	let { isInvalid, validationErrors, validationDetails } = validationState.displayValidation;

	useFormValidation(props, validationState, ref, subSlot(slot, 'formValidation'));

	let onInput = (e: Event) => {
		// since we spread props on label, onInput will end up there as well as in here.
		// so we have to stop propagation at the lowest level that we care about
		e.stopPropagation();
		state.setSelected((getEventTarget(e) as HTMLInputElement).checked);
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
	let [isLabelPressed, setLabelPressed] = useState(false, subSlot(slot, 'labelPressed'));
	let { pressProps: labelProps } = usePress(
		{
			onPressStart(e) {
				// Keyboard interactions are handled directly on the input.
				if (e.pointerType === 'keyboard' || e.pointerType === 'virtual') {
					e.continuePropagation();
					return;
				}

				onPressStart?.(e);
				onPressChange?.(true);
				setLabelPressed(true);
			},
			onPressEnd(e) {
				// Keyboard interactions are handled directly on the input.
				if (e.pointerType === 'keyboard' || e.pointerType === 'virtual') {
					e.continuePropagation();
					return;
				}

				onPressEnd?.(e);
				onPressChange?.(false);
				setLabelPressed(false);
			},
			onPressUp(e) {
				if (e.pointerType === 'keyboard' || e.pointerType === 'virtual') {
					e.continuePropagation();
					return;
				}

				onPressUp?.(e);
			},
			onClick,
			onPress(e) {
				if (e.pointerType === 'keyboard' || e.pointerType === 'virtual') {
					e.continuePropagation();
					return;
				}

				onPress?.(e);
				state.toggle();
				ref.current?.focus();

				let groupValidationState = (props as any)[privateValidationStateProp];

				let { commitValidation } = groupValidationState ? groupValidationState : validationState;

				commitValidation();
			},
			isDisabled: isDisabled || isReadOnly,
		},
		subSlot(slot, 'labelPress'),
	);

	let { focusableProps } = useFocusable(props, ref, subSlot(slot, 'focusable'));
	let interactions = mergeProps(pressProps, focusableProps);
	let domProps = filterDOMProps(props, { labelable: true });

	useFormReset(ref, state.defaultSelected, state.setSelected, subSlot(slot, 'formReset'));

	// Copied from useField because we don't want the label behavior that provides.
	let descriptionProps = useSlotId2(undefined, subSlot(slot, 'description'));
	let errorMessageProps = useSlotId2(undefined, subSlot(slot, 'errorMessage'));

	return {
		labelProps: mergeProps(labelProps, {
			// octane adaptation: upstream preventDefaults ALL label clicks to stop the label's
			// built-in click-forwarding (a second, doubled activation) — React's synthetic
			// onChange still fires either way, and the controlled `checked` prop papers over
			// the cancelled DOM activation. With native events, an unconditional preventDefault
			// would ALSO cancel the input's own activation (no `input` event → no toggle) for
			// virtual clicks (element.click(), assistive tech). Scope it to clicks that do NOT
			// target the input: label-body clicks still can't double-forward, input-targeted
			// clicks activate natively. Real pointer gestures toggle via the label press path
			// on both sides; virtual label-body clicks toggle on NEITHER side (React's
			// onChange only fires for clicks targeting the input).
			onClick: (e: MouseEvent) => {
				if (getEventTarget(e) !== ref.current) {
					e.preventDefault();
				}
			},
		}),
		inputProps: mergeProps(domProps, {
			checked: state.isSelected,
			'aria-required': (isRequired && validationBehavior === 'aria') || undefined,
			required: isRequired && validationBehavior === 'native',
			'aria-invalid': isInvalid || props.validationState === 'invalid' || undefined,
			'aria-errormessage': props['aria-errormessage'],
			'aria-controls': props['aria-controls'],
			'aria-readonly': isReadOnly || undefined,
			'aria-describedby':
				[descriptionProps.id, errorMessageProps.id, ariaDescribedby].filter(Boolean).join(' ') ||
				undefined,
			onInput,
			disabled: isDisabled,
			...(value == null ? {} : { value }),
			name,
			form,
			type: 'checkbox',
			...interactions,
		}),
		descriptionProps,
		errorMessageProps,
		isSelected: state.isSelected,
		isPressed: isPressed || isLabelPressed,
		isDisabled,
		isReadOnly,
		isInvalid: isInvalid || props.validationState === 'invalid',
		validationErrors,
		validationDetails,
	};
}
