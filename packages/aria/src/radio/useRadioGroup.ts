// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/radio/useRadioGroup.ts).
// octane adaptations: the keyboard/focus handlers receive native events; public-hook
// slot threading.
import type {
	AriaLabelingProps,
	AriaValidationProps,
	DOMProps,
	InputDOMProps,
	ValidationResult,
} from '@react-types/shared';

// octane adaptation: structural prop bag (upstream's DOMAttributes drags React handler
// types; the keyboard handler here is a native KeyboardEvent handler).
type DOMAttributes = Record<string, any>;

import { S, splitSlot, subSlot } from '../internal';
import { filterDOMProps } from '../utils/filterDOMProps';
import { getEventTarget } from '../utils/shadowdom/DOMFunctions';
import { getFocusableTreeWalker } from '../focus/FocusScope';
import { getOwnerWindow } from '../utils/domHelpers';
import { mergeProps } from '../utils/mergeProps';
import { radioGroupData } from './utils';
import type { RadioGroupProps, RadioGroupState } from '../stately/radio/useRadioGroupState';
import { useField } from '../label/useField';
import { useFocusWithin } from '../interactions/useFocusWithin';
import { useId } from '../utils/useId';
import { useLocale } from '../i18n/I18nProvider';

export interface AriaRadioGroupProps
	extends RadioGroupProps, InputDOMProps, DOMProps, AriaLabelingProps, AriaValidationProps {}

export interface RadioGroupAria extends ValidationResult {
	/** Props for the radio group wrapper element. */
	radioGroupProps: DOMAttributes;
	/** Props for the radio group's visible label (if any). */
	labelProps: DOMAttributes;
	/** Props for the radio group description element, if any. */
	descriptionProps: DOMAttributes;
	/** Props for the radio group error message element, if any. */
	errorMessageProps: DOMAttributes;
}

export function useRadioGroup(props: AriaRadioGroupProps, state: RadioGroupState): RadioGroupAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useRadioGroup(
	props: AriaRadioGroupProps,
	state: RadioGroupState,
	slot: symbol | undefined,
): RadioGroupAria;
export function useRadioGroup(...args: any[]): RadioGroupAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useRadioGroup');
	const props = user[0] as AriaRadioGroupProps;
	const state = user[1] as RadioGroupState;

	let {
		name,
		form,
		isReadOnly,
		isRequired,
		isDisabled,
		orientation = 'vertical',
		validationBehavior = 'aria',
	} = props;
	let { direction } = useLocale(subSlot(slot, 'locale'));

	let { isInvalid, validationErrors, validationDetails } = state.displayValidation;
	let { labelProps, fieldProps, descriptionProps, errorMessageProps } = useField(
		{
			...props,
			// Radio group is not an HTML input element so it
			// shouldn't be labeled by a <label> element.
			labelElementType: 'span',
			isInvalid: state.isInvalid,
			errorMessage: props.errorMessage || validationErrors,
		},
		subSlot(slot, 'field'),
	);

	let domProps = filterDOMProps(props, { labelable: true });

	// When the radio group loses focus, reset the focusable radio to null if
	// there is no selection. This allows tabbing into the group from either
	// direction to go to the first or last radio.
	let { focusWithinProps } = useFocusWithin(
		{
			onBlurWithin(e: FocusEvent) {
				(props as any).onBlur?.(e);
				if (!state.selectedValue) {
					state.setLastFocusedValue(null);
				}
			},
			onFocusWithin: (props as any).onFocus,
			onFocusWithinChange: (props as any).onFocusChange,
		},
		subSlot(slot, 'focusWithin'),
	);

	let onKeyDown = (e: KeyboardEvent) => {
		let nextDir;
		switch (e.key) {
			case 'ArrowRight':
				if (direction === 'rtl' && orientation !== 'vertical') {
					nextDir = 'prev';
				} else {
					nextDir = 'next';
				}
				break;
			case 'ArrowLeft':
				if (direction === 'rtl' && orientation !== 'vertical') {
					nextDir = 'next';
				} else {
					nextDir = 'prev';
				}
				break;
			case 'ArrowDown':
				nextDir = 'next';
				break;
			case 'ArrowUp':
				nextDir = 'prev';
				break;
			default:
				return;
		}
		e.preventDefault();
		let walker = getFocusableTreeWalker(e.currentTarget as Element, {
			from: getEventTarget(e) as Element,
			accept: (node: Element) =>
				node instanceof getOwnerWindow(node).HTMLInputElement &&
				(node as HTMLInputElement).type === 'radio',
		});
		let nextElem;
		if (nextDir === 'next') {
			nextElem = walker.nextNode();
			if (!nextElem) {
				walker.currentNode = e.currentTarget as Node;
				nextElem = walker.firstChild();
			}
		} else {
			nextElem = walker.previousNode();
			if (!nextElem) {
				walker.currentNode = e.currentTarget as Node;
				nextElem = walker.lastChild();
			}
		}

		if (nextElem) {
			// Call focus on nextElem so that keyboard navigation scrolls the radio into view
			(nextElem as HTMLInputElement).focus();
			state.setSelectedValue((nextElem as HTMLInputElement).value);
		}
	};

	let groupName = useId(name, subSlot(slot, 'name'));
	radioGroupData.set(state, {
		name: groupName,
		form,
		descriptionId: (descriptionProps as any).id,
		errorMessageId: (errorMessageProps as any).id,
		validationBehavior,
	});

	return {
		radioGroupProps: mergeProps(domProps, {
			// https://www.w3.org/TR/wai-aria-1.2/#radiogroup
			role: 'radiogroup',
			onKeyDown,
			'aria-invalid': state.isInvalid || undefined,
			'aria-errormessage': props['aria-errormessage'],
			'aria-readonly': isReadOnly || undefined,
			'aria-required': isRequired || undefined,
			'aria-disabled': isDisabled || undefined,
			'aria-orientation': orientation,
			...fieldProps,
			...focusWithinProps,
		}),
		labelProps,
		descriptionProps,
		errorMessageProps,
		isInvalid,
		validationErrors,
		validationDetails,
	};
}
