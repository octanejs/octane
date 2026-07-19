// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Select.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement` (the trigger wrapper's two
// children arrive positionally); NO forwardRef — `createHideableComponent` forwards
// `props.ref` positionally exactly like TextField; the plain-`.ts` components use the
// S()/subSlot component-slot convention. The collection composes the Phase-4 engine
// (`CollectionBuilder`); the open listbox reuses ./ListBox by providing a ListState via
// `ListStateContext` (ListBox short-circuits into ListBoxInner without rebuilding state).
// react-aria/react-stately private imports come from the binding's ported modules
// (`../select/useSelect` + `../select/HiddenSelect`, `../stately/select/useSelectState`).
// Upstream's Parcel glob intl import (`../intl/*.json`, the react-aria-components package
// dictionary) is ported module-locally below with just the `selectPlaceholder` key this
// module reads (first consumer; hoist to a generated ../intl/components index when another
// RAC component needs the package dictionary). Hooks are hoisted out of argument object
// literals per the binding convention; explicit dependency arrays are preserved verbatim.
import type { Collection as ICollection, Node } from '@react-types/shared';
import { Fragment, createContext, createElement, useContext, useMemo, useRef } from 'octane';

import { CollectionBuilder } from '../collections/CollectionBuilder';
import { createHideableComponent } from '../collections/Hidden';
import { useFocusRing } from '../focus/useFocusRing';
import { useListFormatter } from '../i18n/useListFormatter';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';
import { S, subSlot } from '../internal';
import { HiddenSelect } from '../select/HiddenSelect';
import { type AriaSelectProps, useSelect } from '../select/useSelect';
import { type SelectState, useSelectState } from '../stately/select/useSelectState';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { ButtonContext } from './Button';
import type { ItemRenderProps } from './Collection';
import { OverlayTriggerStateContext } from './Dialog';
import { FieldErrorContext } from './FieldError';
import { FormContext } from './Form';
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
type RefObject<T> = { current: T };
type GlobalDOMAttributes = Record<string, any>;
// octane adaptation: structural prop bag (upstream extends React's HTMLAttributes).
type HTMLAttributes = Record<string, any>;

// The react-aria-components package intl dictionary, reduced to the key this module
// reads. Strings are copied VERBATIM from .react-spectrum/packages/react-aria-components/
// intl/*.json; refresh from the pinned checkout on version bumps, never hand-edit.
const intlMessages = {
	'ar-AE': { selectPlaceholder: 'حدد عنصرًا' },
	'bg-BG': { selectPlaceholder: 'Изберете предмет' },
	'cs-CZ': { selectPlaceholder: 'Vyberte položku' },
	'da-DK': { selectPlaceholder: 'Vælg et element' },
	'de-DE': { selectPlaceholder: 'Element wählen' },
	'el-GR': { selectPlaceholder: 'Επιλέξτε ένα αντικείμενο' },
	'en-US': { selectPlaceholder: 'Select an item' },
	'es-ES': { selectPlaceholder: 'Seleccionar un artículo' },
	'et-EE': { selectPlaceholder: 'Valige üksus' },
	'fi-FI': { selectPlaceholder: 'Valitse kohde' },
	'fr-FR': { selectPlaceholder: 'Sélectionner un élément' },
	'he-IL': { selectPlaceholder: 'בחר פריט' },
	'hr-HR': { selectPlaceholder: 'Odaberite stavku' },
	'hu-HU': { selectPlaceholder: 'Válasszon ki egy elemet' },
	'it-IT': { selectPlaceholder: 'Seleziona un elemento' },
	'ja-JP': { selectPlaceholder: '項目を選択' },
	'ko-KR': { selectPlaceholder: '항목 선택' },
	'lt-LT': { selectPlaceholder: 'Pasirinkite elementą' },
	'lv-LV': { selectPlaceholder: 'Izvēlēties vienumu' },
	'nb-NO': { selectPlaceholder: 'Velg et element' },
	'nl-NL': { selectPlaceholder: 'Selecteer een item' },
	'pl-PL': { selectPlaceholder: 'Wybierz element' },
	'pt-BR': { selectPlaceholder: 'Selecione um item' },
	'pt-PT': { selectPlaceholder: 'Selecione um item' },
	'ro-RO': { selectPlaceholder: 'Selectați un element' },
	'ru-RU': { selectPlaceholder: 'Выберите элемент' },
	'sk-SK': { selectPlaceholder: 'Vyberte položku' },
	'sl-SI': { selectPlaceholder: 'Izberite element' },
	'sr-SP': { selectPlaceholder: 'Izaberite stavku' },
	'sv-SE': { selectPlaceholder: 'Välj en artikel' },
	'tr-TR': { selectPlaceholder: 'Bir öğe seçin' },
	'uk-UA': { selectPlaceholder: 'Виберіть елемент' },
	'zh-CN': { selectPlaceholder: '选择一个项目' },
	'zh-TW': { selectPlaceholder: '選取項目' },
};

type SelectionMode = 'single' | 'multiple';

export interface SelectRenderProps {
	/**
	 * Whether the select is focused, either via a mouse or keyboard.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the select is keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the select is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * Whether the select is currently open.
	 *
	 * @selector [data-open]
	 */
	isOpen: boolean;
	/**
	 * Whether the select is invalid.
	 *
	 * @selector [data-invalid]
	 */
	isInvalid: boolean;
	/**
	 * Whether the select is required.
	 *
	 * @selector [data-required]
	 */
	isRequired: boolean;
}

export interface SelectProps<T, M extends SelectionMode = 'single'>
	extends
		Omit<
			AriaSelectProps<T, M>,
			| 'children'
			| 'label'
			| 'description'
			| 'errorMessage'
			| 'validationState'
			| 'validationBehavior'
			| 'items'
		>,
		RACValidation,
		RenderProps<SelectRenderProps>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Select'
	 */
	className?: ClassNameOrFunction<SelectRenderProps>;
	/**
	 * Temporary text that occupies the select when it is empty.
	 *
	 * @default 'Select an item' (localized)
	 */
	placeholder?: string;
}

export const SelectContext =
	createContext<ContextValue<SelectProps<any, SelectionMode>, HTMLDivElement>>(null);
export const SelectStateContext = createContext<SelectState<unknown, SelectionMode> | null>(null);

/**
 * A select displays a collapsible list of options and allows a user to select one of them.
 */
export const Select: <T, M extends SelectionMode = 'single'>(
	props: SelectProps<T, M> & { ref?: any },
) => any = /*#__PURE__*/ createHideableComponent(function Select<
	T,
	M extends SelectionMode = 'single',
>(props: SelectProps<T, M>, ref: any): any {
	const slot = S('Select');
	[props, ref] = useContextProps(props as any, ref, SelectContext, subSlot(slot, 'ctx')) as any;
	let { children, isDisabled = false, isInvalid = false, isRequired = false } = props;
	let content = useMemo(
		() =>
			typeof children === 'function'
				? children({
						isOpen: false,
						isDisabled,
						isInvalid,
						isRequired,
						isFocused: false,
						isFocusVisible: false,
						defaultChildren: null,
					})
				: children,
		[children, isDisabled, isInvalid, isRequired],
		subSlot(slot, 'content'),
	);

	return createElement(CollectionBuilder, {
		content,
		children: (collection: ICollection<Node<any>>) =>
			createElement(SelectInner as any, { props, collection, selectRef: ref }),
	});
}) as any;

// Contexts to clear inside the popover.
const CLEAR_CONTEXTS = [LabelContext, ButtonContext, TextContext];

interface SelectInnerProps<T> {
	props: SelectProps<T, SelectionMode>;
	selectRef: RefObject<HTMLDivElement | null>;
	collection: ICollection<Node<T>>;
}

function SelectInner<T>({ props, selectRef: ref, collection }: SelectInnerProps<T>): any {
	const slot = S('SelectInner');
	let { validationBehavior: formValidationBehavior } = useSlottedContext(FormContext) || {};
	let validationBehavior = props.validationBehavior ?? formValidationBehavior ?? 'native';
	let state = useSelectState(
		{
			...props,
			collection,
			children: undefined,
			validationBehavior,
		} as any,
		subSlot(slot, 'state'),
	);

	let { isFocusVisible, focusProps } = useFocusRing({ within: true }, subSlot(slot, 'focusRing'));

	// Get props for child elements from useSelect
	let buttonRef = useRef<HTMLButtonElement | null>(null, subSlot(slot, 'buttonRef'));
	let [labelRef, label] = useSlot(
		!props['aria-label'] && !props['aria-labelledby'],
		subSlot(slot, 'labelSlot'),
	);
	let {
		labelProps,
		triggerProps,
		valueProps,
		menuProps,
		descriptionProps,
		errorMessageProps,
		hiddenSelectProps,
		...validation
	} = useSelect(
		{
			...removeDataAttributes(props),
			label,
			validationBehavior,
		} as any,
		state,
		buttonRef,
		subSlot(slot, 'select'),
	);

	// Only expose a subset of state to renderProps function to avoid infinite render loop
	let renderPropsState = useMemo(
		() => ({
			isOpen: state.isOpen,
			isFocused: state.isFocused,
			isFocusVisible,
			isDisabled: props.isDisabled || false,
			isInvalid: validation.isInvalid || false,
			isRequired: props.isRequired || false,
		}),
		[
			state.isOpen,
			state.isFocused,
			isFocusVisible,
			props.isDisabled,
			validation.isInvalid,
			props.isRequired,
		],
		subSlot(slot, 'renderPropsState'),
	);

	let renderProps = useRenderProps(
		{
			...props,
			values: renderPropsState,
			defaultClassName: 'react-aria-Select',
		} as any,
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props, { global: true });
	delete DOMProps.id;

	let scrollRef = useRef(null, subSlot(slot, 'scrollRef'));

	return createElement(Provider, {
		values: [
			[SelectContext, props],
			[SelectStateContext, state],
			[SelectValueContext, valueProps],
			[LabelContext, { ...labelProps, ref: labelRef, elementType: 'span' }],
			[
				ButtonContext,
				{ ...triggerProps, ref: buttonRef, isPressed: state.isOpen, autoFocus: props.autoFocus },
			],
			[OverlayTriggerStateContext, state],
			[
				PopoverContext,
				{
					trigger: 'Select',
					triggerRef: buttonRef,
					scrollRef,
					placement: 'bottom start',
					'aria-labelledby': (menuProps as any)['aria-labelledby'],
					clearContexts: CLEAR_CONTEXTS,
				},
			],
			[ListBoxContext, { ...menuProps, ref: scrollRef }],
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
			[FieldErrorContext, validation],
		] as any,
		children: createElement(
			dom.div,
			{
				...mergeProps(DOMProps, renderProps, focusProps),
				ref,
				slot: props.slot || undefined,
				'data-focused': state.isFocused || undefined,
				'data-focus-visible': isFocusVisible || undefined,
				'data-open': state.isOpen || undefined,
				'data-disabled': props.isDisabled || undefined,
				'data-invalid': validation.isInvalid || undefined,
				'data-required': props.isRequired || undefined,
			},
			renderProps.children,
			createElement(HiddenSelect as any, {
				...hiddenSelectProps,
				autoComplete: props.autoComplete,
			}),
		),
	});
}

export interface SelectValueRenderProps<T> {
	/**
	 * Whether the value is a placeholder.
	 *
	 * @selector [data-placeholder]
	 */
	isPlaceholder: boolean;
	/**
	 * The object value of the first selected item.
	 *
	 * @deprecated
	 */
	selectedItem: T | null;
	/** The object values of the currently selected items. */
	selectedItems: (T | null)[];
	/** The textValue of the currently selected items. */
	selectedText: string;
	/** The state of the select. */
	state: SelectState<T, 'single' | 'multiple'>;
}

export interface SelectValueProps<T>
	extends
		Omit<HTMLAttributes, keyof RenderProps<unknown>>,
		RenderProps<SelectValueRenderProps<T>, 'span'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-SelectValue'
	 */
	className?: ClassNameOrFunction<SelectValueRenderProps<T>>;
}

export const SelectValueContext =
	createContext<ContextValue<SelectValueProps<any>, HTMLSpanElement>>(null);

/**
 * SelectValue renders the current value of a Select, or a placeholder if no value is selected.
 * It is usually placed within the button element.
 */
export const SelectValue: <T>(props: SelectValueProps<T> & { ref?: any }) => any =
	/*#__PURE__*/ createHideableComponent(function SelectValue<T>(
		props: SelectValueProps<T>,
		ref: any,
	): any {
		const slot = S('SelectValue');
		[props, ref] = useContextProps(props, ref, SelectValueContext, subSlot(slot, 'ctx'));
		let state = useContext(SelectStateContext)! as SelectState<T, 'single' | 'multiple'>;
		let { placeholder } = useSlottedContext(SelectContext)!;
		let rendered = state.selectedItems.map((item) => {
			let rendered = item.props?.children;
			// If the selected item has a function as a child, we need to call it to render an element.
			if (typeof rendered === 'function') {
				let fn = rendered as (s: ItemRenderProps) => ReactNode;
				rendered = fn({
					isHovered: false,
					isPressed: false,
					isSelected: false,
					isFocused: false,
					isFocusVisible: false,
					isDisabled: false,
					selectionMode: 'single',
					selectionBehavior: 'toggle',
				});
			}

			return rendered;
		});

		let formatter = useListFormatter(undefined, subSlot(slot, 'formatter'));
		let textValue = useMemo(
			() => state.selectedItems.map((item) => item?.textValue),
			[state.selectedItems],
			subSlot(slot, 'textValue'),
		);
		let selectionMode = state.selectionManager.selectionMode;
		let selectedText = useMemo(
			() => (selectionMode === 'single' ? (textValue[0] ?? '') : formatter.format(textValue)),
			[selectionMode, formatter, textValue],
			subSlot(slot, 'selectedText'),
		);

		let defaultChildren = useMemo(
			() => {
				if (selectionMode === 'single') {
					return rendered[0];
				}

				let parts = formatter.formatToParts(textValue);
				if (parts.length === 0) {
					return null;
				}

				let index = 0;
				return parts.map((part) => {
					if (part.type === 'element') {
						return createElement(Fragment, { key: index }, rendered[index++]);
					} else {
						return part.value;
					}
				});
			},
			[selectionMode, formatter, textValue, rendered],
			subSlot(slot, 'defaultChildren'),
		);

		let stringFormatter = useLocalizedStringFormatter(
			intlMessages,
			'react-aria-components',
			subSlot(slot, 'stringFormatter'),
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
				defaultChildren:
					defaultChildren ?? placeholder ?? stringFormatter.format('selectPlaceholder'),
				defaultClassName: 'react-aria-SelectValue',
				values: {
					selectedItem: (state.selectedItems[0]?.value as T) ?? null,
					selectedItems,
					selectedText,
					isPlaceholder: state.selectedItems.length === 0,
					state,
				},
			} as any,
			subSlot(slot, 'render'),
		);

		let DOMProps = filterDOMProps(props, { global: true });

		return createElement(dom.span, {
			ref,
			...DOMProps,
			...renderProps,
			'data-placeholder': state.selectedItems.length === 0 || undefined,
			// clear description and error message slots
			children: createElement(TextContext.Provider, {
				value: undefined,
				children: renderProps.children,
			}),
		});
	}) as any;
