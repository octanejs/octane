// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/textfield/useTextField.ts).
// octane adaptations:
// - onChange→onInput DOM wiring: the per-keystroke state update rides octane's native
//   `input` event (identical timing to React's synthetic onChange for text inputs). The
//   user's own `onInput` prop still runs first (matching React's plugin order, where
//   onInput fires before onChange), chained ahead of the setter.
// - The React intrinsic-element generic machinery (JSX.IntrinsicElements lookup types)
//   collapses to a plain 'input' | 'textarea' parameter with structural prop bags.
// - `FocusableProps` is the ported native-event version; `enterKeyHint` is always the
//   camelCase prop (the React-version probe collapses).
// - Public-hook slot threading.
import type {
	AriaLabelingProps,
	AriaValidationProps,
	FocusableDOMProps,
	HelpTextProps,
	InputBase,
	LabelableProps,
	TextInputBase,
	Validation,
	ValidationResult,
	ValueBase,
	RefObject,
} from '@react-types/shared';
import { useState } from 'octane';

import type { FocusableProps } from '../interactions/useFocusable';
import { S, splitSlot, subSlot } from '../internal';
import { chain } from '../utils/chain';
import { filterDOMProps } from '../utils/filterDOMProps';
import { getEventTarget } from '../utils/shadowdom/DOMFunctions';
import { mergeProps } from '../utils/mergeProps';
import { useControlledState } from '../stately/utils/useControlledState';
import { useField } from '../label/useField';
import { useFocusable } from '../interactions/useFocusable';
import { useFormReset } from '../utils/useFormReset';
import { useFormValidation } from '../form/useFormValidation';
import { useFormValidationState } from '../stately/form/useFormValidationState';

type DOMAttributes = Record<string, any>;
type TextFieldIntrinsicElements = 'input' | 'textarea';

export interface TextFieldProps
	extends
		InputBase,
		Validation<string>,
		HelpTextProps,
		FocusableProps,
		TextInputBase,
		ValueBase<string>,
		LabelableProps {}

export interface AriaTextFieldProps
	extends TextFieldProps, AriaLabelingProps, FocusableDOMProps, AriaValidationProps {
	// https://www.w3.org/TR/wai-aria-1.2/#textbox
	/**
	 * Identifies the currently active element when DOM focus is on a composite widget, textbox,
	 * group, or application.
	 */
	'aria-activedescendant'?: string;
	/**
	 * Indicates whether inputting text could trigger display of one or more predictions of the user's
	 * intended value for an input and specifies how predictions would be presented if they are made.
	 */
	'aria-autocomplete'?: 'none' | 'inline' | 'list' | 'both';
	/**
	 * Indicates the availability and type of interactive popup element, such as menu or dialog, that
	 * can be triggered by an element.
	 */
	'aria-haspopup'?: boolean | 'false' | 'true' | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
	/**
	 * Identifies the element (or elements) whose contents or presence are controlled by the current
	 * element.
	 */
	'aria-controls'?: string;
	/**
	 * An enumerated attribute that defines what action label or icon to preset for the enter key on
	 * virtual keyboards. See
	 * [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/enterkeyhint).
	 */
	enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';
	// octane adaptation: the text-input DOM props are structural (upstream's
	// TextInputDOMProps drags React handler types).
	type?: string;
	pattern?: string;
	autoComplete?: string;
	autoCapitalize?: 'off' | 'none' | 'on' | 'sentences' | 'words' | 'characters';
	maxLength?: number;
	minLength?: number;
	name?: string;
	form?: string;
	placeholder?: string;
	inputMode?: string;
	autoCorrect?: string;
	spellCheck?: string | boolean;
	onCopy?: (e: ClipboardEvent) => void;
	onCut?: (e: ClipboardEvent) => void;
	onPaste?: (e: ClipboardEvent) => void;
	onCompositionEnd?: (e: CompositionEvent) => void;
	onCompositionStart?: (e: CompositionEvent) => void;
	onCompositionUpdate?: (e: CompositionEvent) => void;
	onSelect?: (e: Event) => void;
	onBeforeInput?: (e: InputEvent) => void;
	onInput?: (e: Event) => void;
}

export interface AriaTextFieldOptions<
	T extends TextFieldIntrinsicElements = 'input',
> extends AriaTextFieldProps {
	/**
	 * The HTML element used to render the input, e.g. 'input', or 'textarea'. It determines whether
	 * certain HTML attributes will be included in `inputProps`. For example,
	 * [`type`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#attr-type).
	 *
	 * @default 'input'
	 */
	inputElementType?: T;
}

export interface TextFieldAria extends ValidationResult {
	/** Props for the input element. */
	inputProps: DOMAttributes;
	/** Props for the text field's visible label element, if any. */
	labelProps: DOMAttributes;
	/** Props for the text field's description element, if any. */
	descriptionProps: DOMAttributes;
	/** Props for the text field's error message element, if any. */
	errorMessageProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for a text field.
 */
export function useTextField<T extends TextFieldIntrinsicElements = 'input'>(
	props: AriaTextFieldOptions<T>,
	ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
): TextFieldAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTextField<T extends TextFieldIntrinsicElements = 'input'>(
	props: AriaTextFieldOptions<T>,
	ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
	slot: symbol | undefined,
): TextFieldAria;
export function useTextField(...args: any[]): TextFieldAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTextField');
	const props = user[0] as AriaTextFieldOptions<any>;
	const ref = user[1] as RefObject<HTMLInputElement | HTMLTextAreaElement | null>;

	let {
		inputElementType = 'input',
		isDisabled = false,
		isRequired = false,
		isReadOnly = false,
		type = 'text',
		validationBehavior = 'aria',
	} = props as any;
	let [value, setValue] = useControlledState<string>(
		props.value,
		props.defaultValue || '',
		props.onChange,
		subSlot(slot, 'value'),
	);
	let { focusableProps } = useFocusable(props, ref, subSlot(slot, 'focusable'));
	let validationState = useFormValidationState(
		{
			...props,
			value,
		},
		subSlot(slot, 'validationState'),
	);
	let { isInvalid, validationErrors, validationDetails } = validationState.displayValidation;
	let { labelProps, fieldProps, descriptionProps, errorMessageProps } = useField(
		{
			...props,
			isInvalid,
			errorMessage: props.errorMessage || validationErrors,
		},
		subSlot(slot, 'field'),
	);
	let domProps = filterDOMProps(props, { labelable: true });

	const inputOnlyProps = {
		type,
		pattern: props.pattern,
	};

	let [initialValue] = useState(value, subSlot(slot, 'initialValue'));
	useFormReset(ref, props.defaultValue ?? initialValue, setValue, subSlot(slot, 'reset'));
	useFormValidation(props, validationState, ref, subSlot(slot, 'validation'));

	return {
		labelProps,
		inputProps: mergeProps(domProps, inputElementType === 'input' ? inputOnlyProps : undefined, {
			disabled: isDisabled,
			readOnly: isReadOnly,
			required: isRequired && validationBehavior === 'native',
			'aria-required': (isRequired && validationBehavior === 'aria') || undefined,
			'aria-invalid': isInvalid || undefined,
			'aria-errormessage': props['aria-errormessage'],
			'aria-activedescendant': props['aria-activedescendant'],
			'aria-autocomplete': props['aria-autocomplete'],
			'aria-haspopup': props['aria-haspopup'],
			'aria-controls': props['aria-controls'],
			value,
			// octane adaptation: the state update rides the native `input` event (no
			// synthetic onChange); the user's own onInput runs first, matching React's
			// dispatch order for the same native event.
			onInput: chain(props.onInput, (e: Event) =>
				setValue((getEventTarget(e) as HTMLInputElement).value),
			),
			autoComplete: props.autoComplete,
			autoCapitalize: props.autoCapitalize,
			maxLength: props.maxLength,
			minLength: props.minLength,
			name: props.name,
			form: props.form,
			placeholder: props.placeholder,
			inputMode: props.inputMode,
			autoCorrect: props.autoCorrect,
			spellCheck: props.spellCheck,
			enterKeyHint: props.enterKeyHint,

			// Clipboard events
			onCopy: props.onCopy,
			onCut: props.onCut,
			onPaste: props.onPaste,

			// Composition events
			onCompositionEnd: props.onCompositionEnd,
			onCompositionStart: props.onCompositionStart,
			onCompositionUpdate: props.onCompositionUpdate,

			// Selection events
			onSelect: props.onSelect,

			// Input events
			onBeforeInput: props.onBeforeInput,
			...focusableProps,
			...fieldProps,
		}),
		descriptionProps,
		errorMessageProps,
		isInvalid,
		validationErrors,
		validationDetails,
	};
}
