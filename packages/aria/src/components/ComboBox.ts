// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/ComboBox.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef —
// `createHideableComponent` forwards `props.ref` positionally exactly like TextField; the
// plain-`.ts` components use the S()/subSlot component-slot convention. The collection
// composes the Phase-4 engine (`CollectionBuilder`); the open listbox reuses ./ListBox by
// providing a ListState via `ListStateContext` (ListBox short-circuits into ListBoxInner
// without rebuilding state). react-aria/react-stately private imports come from the
// binding's ported modules (`../combobox/useComboBox`, `../stately/combobox/
// useComboBoxState`). NATIVE EVENTS: the per-keystroke wiring rides octane's native
// `onInput` (produced inside the ported useComboBox → useTextField); no synthetic
// `onChange` is added here. Hooks are hoisted out of argument object literals per the
// binding convention; explicit dependency arrays are preserved verbatim.
import type { Collection as ICollection, Key, Node } from '@react-types/shared';
import {
	createContext,
	createElement,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from 'octane';

import { CollectionBuilder } from '../collections/CollectionBuilder';
import { createHideableComponent } from '../collections/Hidden';
import { type AriaComboBoxProps, useComboBox } from '../combobox/useComboBox';
import { useFilter } from '../i18n/useFilter';
import { useListFormatter } from '../i18n/useListFormatter';
import { S, subSlot } from '../internal';
import { type ComboBoxState, useComboBoxState } from '../stately/combobox/useComboBoxState';
import { filterDOMProps } from '../utils/filterDOMProps';
import { useResizeObserver } from '../utils/useResizeObserver';
import { ButtonContext } from './Button';
import { OverlayTriggerStateContext } from './Dialog';
import { FieldErrorContext } from './FieldError';
import { FormContext } from './Form';
import { GroupContext } from './Group';
import { InputContext } from './Input';
import { LabelContext } from './Label';
import { ListBoxContext, ListStateContext } from './ListBox';
import { PopoverContext } from './Popover';
import { TextContext } from './Text';
import {
	type ClassNameOrFunction,
	type ContextValue,
	dom,
	Provider,
	type RACValidation,
	removeDataAttributes,
	type RenderProps,
	type SlotProps,
	useContextProps,
	useRenderProps,
	useSlot,
	useSlottedContext,
} from './utils';

// octane adaptations: structural aliases for the React types upstream drags along.
type ReactNode = any;
type ReactElement = any;
type RefObject<T> = { current: T };
type GlobalDOMAttributes = Record<string, any>;
// octane adaptation: structural prop bag (upstream extends React's HTMLAttributes).
type HTMLAttributes = Record<string, any>;

type SelectionMode = 'single' | 'multiple';

export interface ComboBoxRenderProps {
	/**
	 * Whether the combobox is currently open.
	 *
	 * @selector [data-open]
	 */
	isOpen: boolean;
	/**
	 * Whether the combobox is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * Whether the combobox is invalid.
	 *
	 * @selector [data-invalid]
	 */
	isInvalid: boolean;
	/**
	 * Whether the combobox is required.
	 *
	 * @selector [data-required]
	 */
	isRequired: boolean;
	/**
	 * Whether the combobox is read only.
	 *
	 * @selector [data-readonly]
	 */
	isReadOnly: boolean;
}

export interface ComboBoxProps<T, M extends SelectionMode = 'single'>
	extends
		Omit<
			AriaComboBoxProps<T, M>,
			| 'children'
			| 'placeholder'
			| 'label'
			| 'description'
			| 'errorMessage'
			| 'validationState'
			| 'validationBehavior'
		>,
		RACValidation,
		RenderProps<ComboBoxRenderProps>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-ComboBox'
	 */
	className?: ClassNameOrFunction<ComboBoxRenderProps>;
	/** The filter function used to determine if a option should be included in the combo box list. */
	defaultFilter?: (textValue: string, inputValue: string) => boolean;
	/**
	 * Whether the text or key of the selected item is submitted as part of an HTML form. When
	 * `allowsCustomValue` is `true`, this option does not apply and the text is always submitted.
	 *
	 * @default 'key'
	 */
	formValue?: 'text' | 'key';
	/** Whether the combo box allows the menu to be open when the collection is empty. */
	allowsEmptyCollection?: boolean;
}

export const ComboBoxContext =
	createContext<ContextValue<ComboBoxProps<any, SelectionMode>, HTMLDivElement>>(null);
export const ComboBoxStateContext = createContext<ComboBoxState<any, SelectionMode> | null>(null);

/**
 * A combo box combines a text input with a listbox, allowing users to filter a list of options to
 * items matching a query.
 */
export const ComboBox: <T, M extends SelectionMode = 'single'>(
	props: ComboBoxProps<T, M> & { ref?: any },
) => any = /*#__PURE__*/ createHideableComponent(function ComboBox<
	T,
	M extends SelectionMode = 'single',
>(props: ComboBoxProps<T, M>, ref: any): any {
	const slot = S('ComboBox');
	[props, ref] = useContextProps(props as any, ref, ComboBoxContext, subSlot(slot, 'ctx')) as any;
	let {
		children,
		isDisabled = false,
		isInvalid = false,
		isRequired = false,
		isReadOnly = false,
	} = props;
	let content = useMemo(
		() =>
			createElement(ListBoxContext.Provider, {
				value: { items: props.items ?? props.defaultItems },
				children:
					typeof children === 'function'
						? children({
								isOpen: false,
								isDisabled,
								isInvalid,
								isRequired,
								defaultChildren: null,
								isReadOnly,
							})
						: children,
			}),
		[children, isDisabled, isInvalid, isRequired, isReadOnly, props.items, props.defaultItems],
		subSlot(slot, 'content'),
	);

	return createElement(CollectionBuilder, {
		content,
		children: (collection: ICollection<Node<any>>) =>
			createElement(ComboBoxInner as any, { props, collection, comboBoxRef: ref }),
	});
}) as any;

// Contexts to clear inside the popover.
const CLEAR_CONTEXTS = [LabelContext, ButtonContext, InputContext, GroupContext, TextContext];

interface ComboBoxInnerProps<T> {
	props: ComboBoxProps<T, SelectionMode>;
	collection: ICollection<Node<T>>;
	comboBoxRef: RefObject<HTMLDivElement | null>;
}

function ComboBoxInner<T>({ props, collection, comboBoxRef: ref }: ComboBoxInnerProps<T>): any {
	const slot = S('ComboBoxInner');
	let { name, formValue = 'key', allowsCustomValue } = props;
	if (allowsCustomValue) {
		formValue = 'text';
	}

	let { validationBehavior: formValidationBehavior } = useSlottedContext(FormContext) || {};
	let validationBehavior = props.validationBehavior ?? formValidationBehavior ?? 'native';
	let { contains } = useFilter({ sensitivity: 'base' }, subSlot(slot, 'filter'));
	let state = useComboBoxState(
		{
			...props,
			defaultFilter: props.defaultFilter || contains,
			// If props.items isn't provided, rely on collection filtering (aka listbox.items is provided or defaultItems provided to Combobox)
			items: props.items,
			children: undefined,
			collection,
			validationBehavior,
		} as any,
		subSlot(slot, 'state'),
	);

	let buttonRef = useRef<HTMLButtonElement | null>(null, subSlot(slot, 'buttonRef'));
	let inputRef = useRef<HTMLInputElement | null>(null, subSlot(slot, 'inputRef'));
	let groupRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'groupRef'));
	let listBoxRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'listBoxRef'));
	let popoverRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'popoverRef'));
	let [labelRef, label] = useSlot(
		!props['aria-label'] && !props['aria-labelledby'],
		subSlot(slot, 'labelSlot'),
	);
	let {
		buttonProps,
		inputProps,
		listBoxProps,
		labelProps,
		descriptionProps,
		errorMessageProps,
		valueProps,
		...validation
	} = useComboBox(
		{
			...removeDataAttributes(props),
			label,
			inputRef,
			buttonRef,
			listBoxRef,
			popoverRef,
			name: formValue === 'text' ? name : undefined,
			validationBehavior,
		} as any,
		state,
		subSlot(slot, 'combobox'),
	);

	// Make menu width match input + button
	// Left for backward compatibility in case a <Group> is not rendered.
	let [menuWidth, setMenuWidth] = useState<string | null>(null, subSlot(slot, 'menuWidth'));
	let onResize = useCallback(
		() => {
			if (inputRef.current && !groupRef.current) {
				let buttonRect = buttonRef.current?.getBoundingClientRect();
				let inputRect = inputRef.current.getBoundingClientRect();
				let minX = buttonRect ? Math.min(buttonRect.left, inputRect.left) : inputRect.left;
				let maxX = buttonRect ? Math.max(buttonRect.right, inputRect.right) : inputRect.right;
				setMenuWidth(maxX - minX + 'px');
			}
		},
		[buttonRef, inputRef, setMenuWidth],
		subSlot(slot, 'onResize'),
	);

	useResizeObserver(
		{
			ref: inputRef,
			onResize: onResize,
		},
		subSlot(slot, 'resizeObserver'),
	);

	// Position popover relative to group if available, otherwise input.
	let triggerRef = useMemo(
		() => ({
			get current() {
				return groupRef.current || inputRef.current;
			},
		}),
		[groupRef, inputRef],
		subSlot(slot, 'triggerRef'),
	);

	// Only expose a subset of state to renderProps function to avoid infinite render loop
	let renderPropsState = useMemo(
		() => ({
			isOpen: state.isOpen,
			isDisabled: props.isDisabled || false,
			isInvalid: validation.isInvalid || false,
			isRequired: props.isRequired || false,
			isReadOnly: props.isReadOnly || false,
		}),
		[state.isOpen, props.isDisabled, validation.isInvalid, props.isRequired, props.isReadOnly],
		subSlot(slot, 'renderPropsState'),
	);

	let renderProps = useRenderProps(
		{
			...props,
			values: renderPropsState,
			defaultClassName: 'react-aria-ComboBox',
		} as any,
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props, { global: true });
	delete DOMProps.id;

	let inputs: ReactElement[] = [];
	if (name && formValue === 'key') {
		let values: (Key | null)[] = Array.isArray(state.value)
			? (state.value as Key[])
			: [state.value as Key | null];
		if (values.length === 0) {
			values = [null];
		}

		inputs = values.map((value, i) =>
			createElement('input', {
				key: i,
				type: 'hidden',
				name,
				form: props.form,
				value: value ?? '',
			}),
		);
	}

	return createElement(Provider, {
		values: [
			[ComboBoxStateContext, state],
			[LabelContext, { ...labelProps, ref: labelRef }],
			[ButtonContext, { ...buttonProps, ref: buttonRef, isPressed: state.isOpen }],
			[InputContext, { ...inputProps, ref: inputRef }],
			[OverlayTriggerStateContext, state],
			[
				PopoverContext,
				{
					ref: popoverRef,
					triggerRef,
					scrollRef: listBoxRef,
					placement: 'bottom start',
					isNonModal: true,
					trigger: 'ComboBox',
					style: { '--trigger-width': menuWidth },
					clearContexts: CLEAR_CONTEXTS,
				},
			],
			[ListBoxContext, { ...listBoxProps, ref: listBoxRef }],
			[ListStateContext, state],
			[
				TextContext,
				{
					slots: {
						description: descriptionProps,
						errorMessage: errorMessageProps,
					},
				},
			],
			[
				GroupContext,
				{ ref: groupRef, isInvalid: validation.isInvalid, isDisabled: props.isDisabled || false },
			],
			[FieldErrorContext, validation],
			[ComboBoxValueContext, valueProps],
		] as any,
		children: createElement(
			dom.div,
			{
				...DOMProps,
				...renderProps,
				ref,
				slot: props.slot || undefined,
				'data-focused': state.isFocused || undefined,
				'data-open': state.isOpen || undefined,
				'data-disabled': props.isDisabled || undefined,
				'data-readonly': props.isReadOnly || undefined,
				'data-invalid': validation.isInvalid || undefined,
				'data-required': props.isRequired || undefined,
			},
			renderProps.children,
			inputs,
		),
	});
}

export interface ComboBoxValueRenderProps<T> {
	/**
	 * Whether the value is a placeholder.
	 *
	 * @selector [data-placeholder]
	 */
	isPlaceholder: boolean;
	/** The object values of the currently selected items. */
	selectedItems: (T | null)[];
	/** The textValue of the currently selected items. */
	selectedText: string;
	/** The state of the ComboBox. */
	state: ComboBoxState<T, 'single' | 'multiple'>;
}

export interface ComboBoxValueProps<T>
	extends
		Omit<HTMLAttributes, keyof RenderProps<unknown>>,
		RenderProps<ComboBoxValueRenderProps<T>, 'div'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-ComboBoxValue'
	 */
	className?: ClassNameOrFunction<ComboBoxValueRenderProps<T>>;
	/** A value to display when no items are selected. */
	placeholder?: ReactNode;
}

export const ComboBoxValueContext =
	createContext<ContextValue<ComboBoxValueProps<any>, HTMLDivElement>>(null);

/**
 * ComboBoxValue renders the selected values of a ComboBox, or a placeholder if no value is
 * selected. By default, the items are rendered as a comma separated list. Use the render function
 * to customize this.
 */
export const ComboBoxValue: <T>(props: ComboBoxValueProps<T> & { ref?: any }) => any =
	/*#__PURE__*/ createHideableComponent(function ComboBoxValue<T>(
		props: ComboBoxValueProps<T>,
		ref: any,
	): any {
		const slot = S('ComboBoxValue');
		[props, ref] = useContextProps(props, ref, ComboBoxValueContext, subSlot(slot, 'ctx'));
		let state = useContext(ComboBoxStateContext)!;
		let formatter = useListFormatter(undefined, subSlot(slot, 'formatter'));
		let selectedText = useMemo(
			() =>
				formatter.format(
					state.selectedItems.map((item) => item?.textValue || '').filter((v) => v !== ''),
				),
			[formatter, state.selectedItems],
			subSlot(slot, 'selectedText'),
		);

		// octane adaptation: hook hoisted out of the useRenderProps argument object below.
		let selectedItems = useMemo(
			() => state.selectedItems.map((item) => (item.value as T) ?? null),
			[state.selectedItems],
			subSlot(slot, 'selectedItems'),
		);

		let renderProps = useRenderProps(
			{
				...props,
				defaultChildren: selectedText || props.placeholder,
				defaultClassName: 'react-aria-ComboBoxValue',
				values: {
					selectedItems,
					selectedText,
					isPlaceholder: state.selectedItems.length === 0,
					state,
				},
			} as any,
			subSlot(slot, 'render'),
		);

		let DOMProps = filterDOMProps(props, { global: true });

		return createElement(dom.div, {
			ref,
			...DOMProps,
			...renderProps,
			'data-placeholder': state.selectedItems.length === 0 || undefined,
		});
	}) as any;
