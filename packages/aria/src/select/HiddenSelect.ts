// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/select/HiddenSelect.tsx).
// octane adaptations:
// - `.tsx` → `.ts`, JSX → `createElement` (from 'octane'); the plain-`.ts` component uses the
//   S()/subSlot component-slot convention and `useRef` from 'octane' (slot-threaded).
// - Native events: the hidden `<select>`'s change handler stays a real native `change`
//   listener — `onChange` on a `<select>` is a genuine DOM change event, so it is kept as-is
//   (NOT converted to `onInput`, which is reserved for TEXT inputs). Upstream's mirror
//   `onInput: onChange` is retained; both are native handlers here. React's synthetic
//   `ChangeEvent` type → `any`.
// - `SelectionMode`/`SelectState` from the ported stately select state; `JSX.Element` → `any`.
import type { FocusableElement, Key, RefObject } from '@react-types/shared';
import { getEventTarget } from '../utils/shadowdom/DOMFunctions';
import { createElement, useCallback, useRef } from 'octane';
import { selectData } from './useSelect';
import type { SelectionMode, SelectState } from '../stately/select/useSelectState';
import { useFormReset } from '../utils/useFormReset';
import { useFormValidation } from '../form/useFormValidation';
import { useVisuallyHidden } from '../visually-hidden/VisuallyHidden';

import { S, splitSlot, subSlot } from '../internal';

export interface AriaHiddenSelectProps {
	/**
	 * Describes the type of autocomplete functionality the input should provide if any. See
	 * [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#htmlattrdefautocomplete).
	 */
	autoComplete?: string;

	/** The text label for the select. */
	label?: any;

	/** HTML form input name. */
	name?: string;

	/**
	 * The `<form>` element to associate the input with.
	 * The value of this attribute must be the id of a `<form>` in the same document.
	 * See [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input#form).
	 */
	form?: string;

	/** Sets the disabled state of the select and input. */
	isDisabled?: boolean;
}

export interface HiddenSelectProps<
	T,
	M extends SelectionMode = 'single',
> extends AriaHiddenSelectProps {
	/** State for the select. */
	state: SelectState<T, M>;

	/** A ref to the trigger element. */
	triggerRef: RefObject<FocusableElement | null>;
}

export interface AriaHiddenSelectOptions extends AriaHiddenSelectProps {
	/** A ref to the hidden `<select>` element. */
	selectRef?: RefObject<HTMLSelectElement | HTMLInputElement | null>;
}

export interface HiddenSelectAria {
	/** Props for the container element. */
	containerProps: Record<string, any>;

	/** Props for the hidden input element. */
	inputProps: Record<string, any>;

	/** Props for the hidden select element. */
	selectProps: Record<string, any>;
}

/**
 * Provides the behavior and accessibility implementation for a hidden `<select>` element, which
 * can be used in combination with `useSelect` to support browser form autofill, mobile form
 * navigation, and native HTML form submission.
 */
export function useHiddenSelect<T, M extends SelectionMode = 'single'>(
	props: AriaHiddenSelectOptions,
	state: SelectState<T, M>,
	triggerRef: RefObject<FocusableElement | null>,
): HiddenSelectAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useHiddenSelect<T, M extends SelectionMode = 'single'>(
	props: AriaHiddenSelectOptions,
	state: SelectState<T, M>,
	triggerRef: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): HiddenSelectAria;
export function useHiddenSelect(...args: any[]): HiddenSelectAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useHiddenSelect');
	const props = user[0] as AriaHiddenSelectOptions;
	const state = user[1] as SelectState<any, any>;
	const triggerRef = user[2] as RefObject<FocusableElement | null>;

	let data = selectData.get(state) || {};
	let { autoComplete, name = data.name, form = data.form, isDisabled = data.isDisabled } = props;
	let { validationBehavior, isRequired } = data;
	let { visuallyHiddenProps } = useVisuallyHidden(
		{
			style: {
				// Prevent page scrolling.
				position: 'fixed',
				top: 0,
				left: 0,
			},
		},
		subSlot(slot, 'visuallyHidden'),
	);

	useFormReset(props.selectRef, state.defaultValue, state.setValue, subSlot(slot, 'formReset'));
	useFormValidation(
		{
			validationBehavior,
			focus: () => triggerRef.current?.focus(),
		},
		state,
		props.selectRef,
		subSlot(slot, 'formValidation'),
	);

	let setValue = state.setValue;
	let onChange = useCallback(
		(e: any) => {
			let eventTarget = getEventTarget(e) as HTMLSelectElement;
			if (eventTarget.multiple) {
				setValue(Array.from(eventTarget.selectedOptions, (option) => option.value) as any);
			} else {
				setValue(e.currentTarget.value as any);
			}
		},
		[setValue],
		subSlot(slot, 'onChange'),
	);

	// In Safari, the <select> cannot have `display: none` or `hidden` for autofill to work.
	// In Firefox, there must be a <label> to identify the <select> whereas other browsers
	// seem to identify it just by surrounding text.
	// The solution is to use <VisuallyHidden> to hide the elements, which clips the elements to a
	// 1px rectangle. In addition, we hide from screen readers with aria-hidden, and make the <select>
	// non tabbable with tabIndex={-1}.
	return {
		containerProps: {
			...visuallyHiddenProps,
			'aria-hidden': true,
			['data-react-aria-prevent-focus']: true,
			['data-a11y-ignore']: 'aria-hidden-focus',
		},
		inputProps: {
			style: { display: 'none' },
		},
		selectProps: {
			tabIndex: -1,
			autoComplete,
			disabled: isDisabled,
			multiple: state.selectionManager.selectionMode === 'multiple',
			required: validationBehavior === 'native' && isRequired,
			name,
			form,
			value: (state.value as string | string[]) ?? '',
			onChange,
			onInput: onChange,
		},
	};
}

/**
 * Renders a hidden native `<select>` element, which can be used to support browser
 * form autofill, mobile form navigation, and native form submission.
 */
export function HiddenSelect<T, M extends SelectionMode = 'single'>(
	props: HiddenSelectProps<T, M>,
): any {
	const slot = S('HiddenSelect');
	let { state, triggerRef, label, name, form, isDisabled } = props;
	let selectRef = useRef(null, subSlot(slot, 'selectRef'));
	let inputRef = useRef(null, subSlot(slot, 'inputRef'));
	let { containerProps, selectProps } = useHiddenSelect(
		{ ...props, selectRef: state.collection.size <= 300 ? selectRef : inputRef },
		state,
		triggerRef,
		subSlot(slot, 'hidden'),
	);

	let values: (Key | null)[] = Array.isArray(state.value) ? state.value : [state.value];

	// If used in a <form>, use a hidden input so the value can be submitted to a server.
	// If the collection isn't too big, use a hidden <select> element for this so that browser
	// autofill will work. Otherwise, use an <input type="hidden">.
	if (state.collection.size <= 300) {
		let optionEls = [...state.collection.getKeys()].map((key) => {
			let item = state.collection.getItem(key);
			if (item && item.type === 'item') {
				return createElement('option', { key: item.key, value: item.key }, item.textValue);
			}
			return undefined;
		});

		return createElement(
			'div',
			{ ...containerProps, 'data-testid': 'hidden-select-container' },
			createElement(
				'label',
				null,
				label,
				createElement('select', { ...selectProps, ref: selectRef }, [
					createElement('option', { key: '__empty__', value: '', label: '\u00A0' }, '\u00A0'),
					optionEls,
					// The collection may be empty during the initial render.
					// Rendering options for the current values ensures the select has a value immediately,
					// making FormData reads consistent.
					state.collection.size === 0 && name
						? values.map((value, i) => createElement('option', { key: i, value: value ?? '' }))
						: null,
				]),
			),
		);
	} else if (name) {
		let data = selectData.get(state) || {};
		let { validationBehavior } = data;

		// Always render at least one hidden input to ensure required form submission.
		if (values.length === 0) {
			values = [null];
		}

		let res = values.map((value, i) => {
			let inputProps: Record<string, any> = {
				type: 'hidden',
				autoComplete: selectProps.autoComplete,
				name,
				form,
				disabled: isDisabled,
				value: value ?? '',
			};

			if (validationBehavior === 'native') {
				// Use a hidden <input type="text"> rather than <input type="hidden">
				// so that an empty value blocks HTML form submission when the field is required.
				return createElement('input', {
					key: i,
					...inputProps,
					ref: i === 0 ? inputRef : null,
					style: { display: 'none' },
					type: 'text',
					required: i === 0 ? selectProps.required : false,
					onChange: () => {
						/** Ignore react warning. */
					},
				});
			}

			return createElement('input', { key: i, ...inputProps, ref: i === 0 ? inputRef : null });
		});

		return res;
	}

	return null;
}
