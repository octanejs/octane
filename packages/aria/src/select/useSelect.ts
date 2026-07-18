// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/select/useSelect.ts).
// octane adaptations:
// - `useMemo` comes from 'octane'; React's synthetic `FocusEvent` type → `any` (native
//   focus/blur events are passed straight through).
// - `SelectionMode`/`SelectProps`/`SelectState` from the ported stately select state
//   (`../stately/select/useSelectState`).
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention: every
//   composed base/sibling hook (useCollator, useMemo, useMenuTrigger, useTypeSelect,
//   useField, useId) receives an explicit derived sub-slot.
// - `selectData` WeakMap is exported for HiddenSelect to read the shared disabled/name/
//   form/validationBehavior data.
import type { AriaButtonProps } from '../button/useButton';

import type {
	AriaLabelingProps,
	DOMAttributes,
	DOMProps,
	FocusableDOMProps,
	KeyboardDelegate,
	RefObject,
	ValidationResult,
} from '@react-types/shared';
import type { AriaListBoxOptions } from '../listbox/useListBox';
import { chain } from '../utils/chain';
import { filterDOMProps } from '../utils/filterDOMProps';
import { useMemo } from 'octane';
import type { HiddenSelectProps } from './HiddenSelect';
import { ListKeyboardDelegate } from '../selection/ListKeyboardDelegate';
import { mergeProps } from '../utils/mergeProps';
import { nodeContains } from '../utils/shadowdom/DOMFunctions';
import type { SelectionMode, SelectProps, SelectState } from '../stately/select/useSelectState';
import { setInteractionModality } from '../interactions/useFocusVisible';
import { useCollator } from '../i18n/useCollator';
import { useField } from '../label/useField';
import { useId } from '../utils/useId';
import { useMenuTrigger } from '../menu/useMenuTrigger';
import { useTypeSelect } from '../selection/useTypeSelect';

import { S, splitSlot, subSlot } from '../internal';

export interface AriaSelectProps<T, M extends SelectionMode = 'single'>
	extends SelectProps<T, M>, DOMProps, AriaLabelingProps, FocusableDOMProps {
	/**
	 * Describes the type of autocomplete functionality the input should provide if any. See
	 * [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#htmlattrdefautocomplete).
	 */
	autoComplete?: string;
	/**
	 * The name of the input, used when submitting an HTML form.
	 */
	name?: string;
	/**
	 * The `<form>` element to associate the input with.
	 * The value of this attribute must be the id of a `<form>` in the same document.
	 * See [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input#form).
	 */
	form?: string;
}

export interface AriaSelectOptions<T, M extends SelectionMode = 'single'> extends Omit<
	AriaSelectProps<T, M>,
	'children'
> {
	/**
	 * An optional keyboard delegate implementation for type to select,
	 * to override the default.
	 */
	keyboardDelegate?: KeyboardDelegate;
}

export interface SelectAria<T, M extends SelectionMode = 'single'> extends ValidationResult {
	/** Props for the label element. */
	labelProps: DOMAttributes;

	/** Props for the popup trigger element. */
	triggerProps: AriaButtonProps;

	/** Props for the element representing the selected value. */
	valueProps: DOMAttributes;

	/** Props for the popup. */
	menuProps: AriaListBoxOptions<T>;

	/** Props for the select's description element, if any. */
	descriptionProps: DOMAttributes;

	/** Props for the select's error message element, if any. */
	errorMessageProps: DOMAttributes;

	/** Props for the hidden select element. */
	hiddenSelectProps: HiddenSelectProps<T, M>;
}

interface SelectData {
	isDisabled?: boolean;
	isRequired?: boolean;
	name?: string;
	form?: string;
	validationBehavior?: 'aria' | 'native';
}

export const selectData: WeakMap<SelectState<any, any>, SelectData> = new WeakMap<
	SelectState<any>,
	SelectData
>();

/**
 * Provides the behavior and accessibility implementation for a select component.
 * A select displays a collapsible list of options and allows a user to select one of them.
 *
 * @param props - Props for the select.
 * @param state - State for the select, as returned by `useListState`.
 */
export function useSelect<T, M extends SelectionMode = 'single'>(
	props: AriaSelectOptions<T, M>,
	state: SelectState<T, M>,
	ref: RefObject<HTMLElement | null>,
): SelectAria<T, M>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSelect<T, M extends SelectionMode = 'single'>(
	props: AriaSelectOptions<T, M>,
	state: SelectState<T, M>,
	ref: RefObject<HTMLElement | null>,
	slot: symbol | undefined,
): SelectAria<T, M>;
export function useSelect(...args: any[]): SelectAria<any, any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSelect');
	const props = user[0] as AriaSelectOptions<any, any>;
	const state = user[1] as SelectState<any, any>;
	const ref = user[2] as RefObject<HTMLElement | null>;

	let { keyboardDelegate, isDisabled, isRequired, name, form, validationBehavior = 'aria' } = props;

	// By default, a KeyboardDelegate is provided which uses the DOM to query layout information (e.g. for page up/page down).
	// When virtualized, the layout object will be passed in as a prop and override this.
	let collator = useCollator({ usage: 'search', sensitivity: 'base' }, subSlot(slot, 'collator'));
	let delegate = useMemo(
		() =>
			keyboardDelegate ||
			new ListKeyboardDelegate(state.collection, state.disabledKeys, ref, collator),
		[keyboardDelegate, state.collection, state.disabledKeys, collator, ref],
		subSlot(slot, 'delegate'),
	);

	let { menuTriggerProps, menuProps } = useMenuTrigger(
		{
			isDisabled,
			type: 'listbox',
		},
		state,
		ref,
		subSlot(slot, 'menuTrigger'),
	);

	let onKeyDown = (e: KeyboardEvent) => {
		if (state.selectionManager.selectionMode === 'multiple') {
			return;
		}

		switch (e.key) {
			case 'ArrowLeft': {
				// prevent scrolling containers
				e.preventDefault();

				let key =
					state.selectedKey != null
						? delegate.getKeyAbove?.(state.selectedKey)
						: delegate.getFirstKey?.();
				if (key != null) {
					state.setSelectedKey(key);
				}
				break;
			}
			case 'ArrowRight': {
				// prevent scrolling containers
				e.preventDefault();

				let key =
					state.selectedKey != null
						? delegate.getKeyBelow?.(state.selectedKey)
						: delegate.getFirstKey?.();
				if (key != null) {
					state.setSelectedKey(key);
				}
				break;
			}
		}
	};

	let { typeSelectProps } = useTypeSelect(
		{
			keyboardDelegate: delegate,
			selectionManager: state.selectionManager,
			onTypeSelect(key) {
				state.setSelectedKey(key);
			},
		},
		subSlot(slot, 'typeSelect'),
	);

	let { isInvalid, validationErrors, validationDetails } = state.displayValidation;
	let { labelProps, fieldProps, descriptionProps, errorMessageProps } = useField(
		{
			...props,
			labelElementType: 'span',
			isInvalid,
			errorMessage: props.errorMessage || validationErrors,
		},
		subSlot(slot, 'field'),
	);

	if (state.selectionManager.selectionMode === 'multiple') {
		typeSelectProps = {};
	}

	let domProps = filterDOMProps(props, { labelable: true });
	let triggerProps = mergeProps(typeSelectProps, menuTriggerProps, fieldProps);

	let valueId = useId(subSlot(slot, 'valueId'));

	selectData.set(state, {
		isDisabled,
		isRequired,
		name,
		form,
		validationBehavior,
	});

	return {
		labelProps: {
			...labelProps,
			onClick: () => {
				if (!props.isDisabled) {
					ref.current?.focus();

					// Show the focus ring so the user knows where focus went
					setInteractionModality('keyboard');
				}
			},
		},
		triggerProps: mergeProps(domProps, {
			...triggerProps,
			isDisabled,
			onKeyDown: chain(triggerProps.onKeyDown, onKeyDown, props.onKeyDown),
			onKeyUp: props.onKeyUp,
			'aria-labelledby': [
				valueId,
				triggerProps['aria-labelledby'],
				triggerProps['aria-label'] && !triggerProps['aria-labelledby'] ? triggerProps.id : null,
			]
				.filter(Boolean)
				.join(' '),
			onFocus(e: any) {
				if (state.isFocused) {
					return;
				}

				if (props.onFocus) {
					props.onFocus(e);
				}

				if (props.onFocusChange) {
					props.onFocusChange(true);
				}

				state.setFocused(true);
			},
			onBlur(e: any) {
				if (state.isOpen) {
					return;
				}

				if (props.onBlur) {
					props.onBlur(e);
				}

				if (props.onFocusChange) {
					props.onFocusChange(false);
				}

				state.setFocused(false);
			},
		}),
		valueProps: {
			id: valueId,
		},
		menuProps: {
			...menuProps,
			onAction: undefined,
			autoFocus: state.focusStrategy || true,
			shouldSelectOnPressUp: true,
			shouldFocusOnHover: true,
			disallowEmptySelection: true,
			linkBehavior: 'selection',
			onBlur: (e: any) => {
				if (nodeContains(e.currentTarget, e.relatedTarget as Node)) {
					return;
				}

				if (props.onBlur) {
					props.onBlur(e);
				}

				if (props.onFocusChange) {
					props.onFocusChange(false);
				}

				state.setFocused(false);
			},
			'aria-labelledby': [
				fieldProps['aria-labelledby'],
				triggerProps['aria-label'] && !fieldProps['aria-labelledby'] ? triggerProps.id : null,
			]
				.filter(Boolean)
				.join(' '),
		},
		descriptionProps,
		errorMessageProps,
		isInvalid,
		validationErrors,
		validationDetails,
		hiddenSelectProps: {
			isDisabled,
			name,
			label: props.label,
			state,
			triggerRef: ref,
			form,
		},
	};
}
