// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/button/useButton.ts).
// octane adaptations:
// - React's `ElementType`/`JSXElementConstructor` → a local structural `ElementType`
//   (octane components are plain functions); the per-element attribute types
//   (`ButtonHTMLAttributes` etc.) → a structural prop bag, so the per-element-type
//   overloads keep upstream's ref typing with a shared structural result.
// - `ReactNode` children → `any` (octane descriptors).
// - `onClick` receives the NATIVE MouseEvent (upstream's `PressEvents.onClick` is typed
//   over React's synthetic event), matching the ported `usePress`.
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention.
import type {
	AriaLabelingProps,
	FocusableDOMProps,
	PressEvents,
	RefObject,
} from '@react-types/shared';

import type { FocusableProps } from '../interactions/useFocusable';

import { S, splitSlot, subSlot } from '../internal';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { useFocusable } from '../interactions/useFocusable';
import { usePress } from '../interactions/usePress';

// octane adaptation: minimal structural element/prop-bag types (upstream's drag React's
// element and per-element attribute types).
export type ElementType = string | ((props: any) => any);
type DOMAttributes = Record<string, any>;

export interface ButtonProps extends Omit<PressEvents, 'onClick'>, FocusableProps {
	/**
	 * **Not recommended – use `onPress` instead.** octane adaptation: native MouseEvent
	 * (upstream's `PressEvents.onClick` is typed over React's synthetic event).
	 */
	onClick?: (e: MouseEvent) => void;
	/** Whether the button is disabled. */
	isDisabled?: boolean;
	/** The content to display in the button. */
	children?: any;
}

export interface AriaBaseButtonProps extends FocusableDOMProps, AriaLabelingProps {
	/** Indicates whether the element is disabled to users of assistive technology. */
	'aria-disabled'?: boolean | 'true' | 'false';
	/**
	 * Indicates whether the element, or another grouping element it controls, is currently expanded
	 * or collapsed.
	 */
	'aria-expanded'?: boolean | 'true' | 'false';
	/**
	 * Indicates the availability and type of interactive popup element, such as menu or dialog, that
	 * can be triggered by an element.
	 */
	'aria-haspopup'?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog' | 'true' | 'false';
	/**
	 * Identifies the element (or elements) whose contents or presence are controlled by the current
	 * element.
	 */
	'aria-controls'?: string;
	/** Indicates the current "pressed" state of toggle buttons. */
	'aria-pressed'?: boolean | 'true' | 'false' | 'mixed';
	/**
	 * Indicates whether this element represents the current item within a container or set of related
	 * elements.
	 */
	'aria-current'?: boolean | 'true' | 'false' | 'page' | 'step' | 'location' | 'date' | 'time';
	/**
	 * The behavior of the button when used in an HTML form.
	 *
	 * @default 'button'
	 */
	type?: 'button' | 'submit' | 'reset';
	/**
	 * Whether to prevent focus from moving to the button when pressing it.
	 *
	 * Caution, this can make the button inaccessible and should only be used when alternative
	 * keyboard interaction is provided, such as ComboBox's MenuTrigger or a NumberField's
	 * increment/decrement control.
	 */
	preventFocusOnPress?: boolean;
	/**
	 * The `<form>` element to associate the button with.
	 * The value of this attribute must be the id of a `<form>` in the same document.
	 * See [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button#form).
	 */
	form?: string;
	/**
	 * The URL that processes the information submitted by the button.
	 * Overrides the action attribute of the button's form owner.
	 *
	 * octane adaptation: typed locally (upstream borrows React's `formAction` attribute type,
	 * which also admits a function form action).
	 */
	formAction?: string | ((formData: FormData) => void | Promise<void>);
	/** Indicates how to encode the form data that is submitted. */
	formEncType?: string;
	/** Indicates the HTTP method used to submit the form. */
	formMethod?: string;
	/** Indicates that the form is not to be validated when it is submitted. */
	formNoValidate?: boolean;
	/** Overrides the target attribute of the button's form owner. */
	formTarget?: string;
	/** Submitted as a pair with the button's value as part of the form data. */
	name?: string;
	/** The value associated with the button's name when it's submitted with the form data. */
	value?: string;
}

export interface AriaButtonElementTypeProps<T extends ElementType = 'button'> {
	/**
	 * The HTML element or octane component used to render the button, e.g. 'div', 'a', or
	 * `RouterLink`.
	 *
	 * @default 'button'
	 */
	elementType?: T | ((props: any) => any);
}

export interface LinkButtonProps<
	T extends ElementType = 'button',
> extends AriaButtonElementTypeProps<T> {
	/** A URL to link to if elementType="a". */
	href?: string;
	/** The target window for the link. */
	target?: string;
	/**
	 * The relationship between the linked resource and the current page. See
	 * [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel).
	 */
	rel?: string;
}

export interface AriaButtonProps<T extends ElementType = 'button'>
	extends ButtonProps, LinkButtonProps<T>, AriaBaseButtonProps {}

export interface AriaButtonOptions<E extends ElementType> extends Omit<
	AriaButtonProps<E>,
	'children'
> {}

export interface ButtonAria<T> {
	/** Props for the button element. */
	buttonProps: T;
	/** Whether the button is currently pressed. */
	isPressed: boolean;
}

// Order with overrides is important: 'button' should be default
export function useButton(
	props: AriaButtonOptions<'button'>,
	ref: RefObject<HTMLButtonElement | null>,
): ButtonAria<DOMAttributes>;
export function useButton(
	props: AriaButtonOptions<'a'>,
	ref: RefObject<HTMLAnchorElement | null>,
): ButtonAria<DOMAttributes>;
export function useButton(
	props: AriaButtonOptions<'div'>,
	ref: RefObject<HTMLDivElement | null>,
): ButtonAria<DOMAttributes>;
export function useButton(
	props: AriaButtonOptions<'input'>,
	ref: RefObject<HTMLInputElement | null>,
): ButtonAria<DOMAttributes>;
export function useButton(
	props: AriaButtonOptions<'span'>,
	ref: RefObject<HTMLSpanElement | null>,
): ButtonAria<DOMAttributes>;
export function useButton(
	props: AriaButtonOptions<ElementType>,
	ref: RefObject<Element | null>,
): ButtonAria<DOMAttributes>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useButton(
	props: AriaButtonOptions<ElementType>,
	ref: RefObject<any>,
	slot: symbol | undefined,
): ButtonAria<DOMAttributes>;
/**
 * Provides the behavior and accessibility implementation for a button component. Handles mouse,
 * keyboard, and touch interactions, focus behavior, and ARIA props for both native button elements
 * and custom element types.
 *
 * @param props - Props to be applied to the button.
 * @param ref - A ref to a DOM element for the button.
 */
export function useButton(...args: any[]): ButtonAria<DOMAttributes> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useButton');
	const props = user[0] as AriaButtonOptions<ElementType>;
	const ref = user[1] as RefObject<any>;

	let {
		elementType = 'button',
		isDisabled,
		onPress,
		onPressStart,
		onPressEnd,
		onPressUp,
		onPressChange,
		preventFocusOnPress,
		// @ts-ignore - undocumented
		allowFocusWhenDisabled,
		onClick,
		href,
		target,
		rel,
		type = 'button',
	} = props;
	let additionalProps;
	if (elementType === 'button') {
		additionalProps = {
			type,
			disabled: isDisabled,
			form: props.form,
			formAction: props.formAction,
			formEncType: props.formEncType,
			formMethod: props.formMethod,
			formNoValidate: props.formNoValidate,
			formTarget: props.formTarget,
			name: props.name,
			value: props.value,
		};
	} else {
		additionalProps = {
			role: 'button',
			href: elementType === 'a' && !isDisabled ? href : undefined,
			target: elementType === 'a' ? target : undefined,
			type: elementType === 'input' ? type : undefined,
			disabled: elementType === 'input' ? isDisabled : undefined,
			'aria-disabled': !isDisabled || elementType === 'input' ? undefined : isDisabled,
			rel: elementType === 'a' ? rel : undefined,
		};
	}

	let { pressProps, isPressed } = usePress(
		{
			onPressStart,
			onPressEnd,
			onPressChange,
			onPress,
			onPressUp,
			onClick,
			isDisabled,
			preventFocusOnPress,
			ref,
		},
		subSlot(slot, 'press'),
	);

	let { focusableProps } = useFocusable(props, ref, subSlot(slot, 'focusable'));
	if (allowFocusWhenDisabled) {
		focusableProps.tabIndex = isDisabled ? -1 : focusableProps.tabIndex;
	}
	let buttonProps = mergeProps(
		focusableProps,
		pressProps,
		filterDOMProps(props, { labelable: true }),
	);

	return {
		isPressed, // Used to indicate press state for visual
		buttonProps: mergeProps(additionalProps, buttonProps, {
			'aria-haspopup': props['aria-haspopup'],
			'aria-expanded': props['aria-expanded'],
			'aria-controls': props['aria-controls'],
			'aria-pressed': props['aria-pressed'],
			'aria-current': props['aria-current'],
			'aria-disabled': props['aria-disabled'],
		}),
	};
}
