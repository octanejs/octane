// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/searchfield/useSearchField.ts).
// octane adaptations: the Parcel glob intl import becomes the generated
// src/intl/searchfield index (verbatim dictionaries); per-element attribute types →
// structural bags; the keydown handler receives the wrapped BaseEvent from the ported
// useKeyboard (so `continuePropagation()` works); public-hook slot threading.
import type { RefObject, ValidationResult } from '@react-types/shared';

import type { AriaButtonProps } from '../button/useButton';
import { AriaTextFieldProps, useTextField } from '../textfield/useTextField';
import { S, splitSlot, subSlot } from '../internal';
import { chain } from '../utils/chain';
import intlMessages from '../intl/searchfield';
import type {
	SearchFieldProps,
	SearchFieldState,
} from '../stately/searchfield/useSearchFieldState';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';

type DOMAttributes = Record<string, any>;

export interface AriaSearchFieldProps extends SearchFieldProps, Omit<AriaTextFieldProps, 'type'> {
	/**
	 * An enumerated attribute that defines what action label or icon to preset for the enter key on
	 * virtual keyboards. See
	 * [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/enterkeyhint).
	 */
	enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';
	/**
	 * The type of input to render. See
	 * [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#htmlattrdeftype).
	 *
	 * @default 'search'
	 */
	type?: 'text' | 'search' | 'url' | 'tel' | 'email' | 'password' | (string & {});
}

export interface SearchFieldAria extends ValidationResult {
	/** Props for the text field's visible label element (if any). */
	labelProps: DOMAttributes;
	/** Props for the input element. */
	inputProps: DOMAttributes;
	/** Props for the clear button. */
	clearButtonProps: AriaButtonProps;
	/** Props for the searchfield's description element, if any. */
	descriptionProps: DOMAttributes;
	/** Props for the searchfield's error message element, if any. */
	errorMessageProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for a search field.
 */
export function useSearchField(
	props: AriaSearchFieldProps,
	state: SearchFieldState,
	inputRef: RefObject<HTMLInputElement | null>,
): SearchFieldAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSearchField(
	props: AriaSearchFieldProps,
	state: SearchFieldState,
	inputRef: RefObject<HTMLInputElement | null>,
	slot: symbol | undefined,
): SearchFieldAria;
export function useSearchField(...args: any[]): SearchFieldAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSearchField');
	const props = user[0] as AriaSearchFieldProps;
	const state = user[1] as SearchFieldState;
	const inputRef = user[2] as RefObject<HTMLInputElement | null>;

	let stringFormatter = useLocalizedStringFormatter(
		intlMessages,
		'@react-aria/searchfield',
		subSlot(slot, 'strings'),
	);
	let { isDisabled, isReadOnly, onSubmit, onClear, type = 'search' } = props;
	let onKeyDown = (e: any) => {
		const key = e.key;

		if (key === 'Enter' && (isDisabled || isReadOnly)) {
			e.preventDefault();
		}

		if (isDisabled || isReadOnly) {
			return;
		}

		// for backward compatibility;
		// otherwise, "Enter" on an input would trigger a form submit, the default browser behavior
		if (key === 'Enter' && onSubmit) {
			e.preventDefault();
			onSubmit(state.value);
		}

		if (key === 'Escape') {
			// Also check the inputRef value for the case where the value was set directly on the input element instead of going through
			// the hook
			if (state.value === '' && (!inputRef.current || inputRef.current.value === '')) {
				e.continuePropagation();
			} else {
				e.preventDefault();
				state.setValue('');
				if (onClear) {
					onClear();
				}
			}
		}
	};

	let onClearButtonClick = () => {
		state.setValue('');

		if (onClear) {
			onClear();
		}
	};

	let onPressStart = () => {
		// this is in PressStart for mobile so that touching the clear button doesn't remove focus from
		// the input and close the keyboard
		inputRef.current?.focus();
	};

	let { labelProps, inputProps, descriptionProps, errorMessageProps, ...validation } = useTextField(
		{
			...props,
			value: state.value,
			onChange: state.setValue,
			onKeyDown: !isReadOnly ? chain(onKeyDown, props.onKeyDown) : props.onKeyDown,
			type,
		} as any,
		inputRef,
		subSlot(slot, 'textField'),
	);

	return {
		labelProps,
		inputProps: {
			...inputProps,
			// already handled by useSearchFieldState
			defaultValue: undefined,
		},
		clearButtonProps: {
			'aria-label': stringFormatter.format('Clear search'),
			excludeFromTabOrder: true,
			preventFocusOnPress: true,
			isDisabled: isDisabled || isReadOnly,
			onPress: onClearButtonClick,
			onPressStart,
		},
		descriptionProps,
		errorMessageProps,
		...validation,
	};
}
