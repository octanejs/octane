// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/utils.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — octane refs are
// ordinary props, so `useContextProps(props, ref, context)` keeps its upstream shape but the
// `ref` argument is the caller's `props.ref` (and the local `ref` key is stripped from the
// returned merged props — it is already folded into the returned merged object ref); the `dom`
// proxy caches plain bound components instead of forwardRef wrappers; public hooks get the
// binding's slot threading (splitSlot/subSlot) — `useSlottedContext` composes only the
// context-identity-keyed `useContext` but still strips a trailing injected slot symbol so its
// optional user args stay positionally sound; `useSlot` re-exports the identical react-aria
// hook from `../utils/useSlot`; React's CSSProperties/ReactNode/JSX-intrinsics types → minimal
// structural aliases (`E extends string`); explicit dep arrays are preserved verbatim.
import type { AriaLabelingProps, DOMProps as SharedDOMProps } from '@react-types/shared';
import { type Context, createElement, useContext, useMemo, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { type MergableRef, mergeRefs } from '../utils/mergeRefs';
import { mergeProps } from '../utils/mergeProps';
import { useLayoutEffect } from '../utils/useLayoutEffect';
import { useObjectRef } from '../utils/useObjectRef';

// Identical implementation upstream duplicates in RAC's utils; import, don't duplicate.
export { useSlot } from '../utils/useSlot';

// octane adaptations: minimal structural aliases for the React types upstream drags along.
export type CSSProperties = Record<string, any>;
type ReactNode = any;
type ReactElement = any;
type ElementProps = Record<string, any>;
type MutableRefObject<T> = { current: T };

export const DEFAULT_SLOT = Symbol('default');

interface SlottedValue<T> {
	slots?: Record<string | symbol, T>;
}

export type SlottedContextValue<T> = SlottedValue<T> | T | null | undefined;
export type ContextValue<T, E> = SlottedContextValue<WithRef<T, E>>;

type ProviderValue<T> = [Context<SlottedContextValue<T>>, SlottedContextValue<T>];
type ProviderValues<A, B, C, D, E, F, G, H, I, J, K, L> =
	| [ProviderValue<A>]
	| [ProviderValue<A>, ProviderValue<B>]
	| [ProviderValue<A>, ProviderValue<B>, ProviderValue<C>]
	| [ProviderValue<A>, ProviderValue<B>, ProviderValue<C>, ProviderValue<D>]
	| [ProviderValue<A>, ProviderValue<B>, ProviderValue<C>, ProviderValue<D>, ProviderValue<E>]
	| [
			ProviderValue<A>,
			ProviderValue<B>,
			ProviderValue<C>,
			ProviderValue<D>,
			ProviderValue<E>,
			ProviderValue<F>,
	  ]
	| [
			ProviderValue<A>,
			ProviderValue<B>,
			ProviderValue<C>,
			ProviderValue<D>,
			ProviderValue<E>,
			ProviderValue<F>,
			ProviderValue<G>,
	  ]
	| [
			ProviderValue<A>,
			ProviderValue<B>,
			ProviderValue<C>,
			ProviderValue<D>,
			ProviderValue<E>,
			ProviderValue<F>,
			ProviderValue<G>,
			ProviderValue<H>,
	  ]
	| [
			ProviderValue<A>,
			ProviderValue<B>,
			ProviderValue<C>,
			ProviderValue<D>,
			ProviderValue<E>,
			ProviderValue<F>,
			ProviderValue<G>,
			ProviderValue<H>,
			ProviderValue<I>,
	  ]
	| [
			ProviderValue<A>,
			ProviderValue<B>,
			ProviderValue<C>,
			ProviderValue<D>,
			ProviderValue<E>,
			ProviderValue<F>,
			ProviderValue<G>,
			ProviderValue<H>,
			ProviderValue<I>,
			ProviderValue<J>,
	  ]
	| [
			ProviderValue<A>,
			ProviderValue<B>,
			ProviderValue<C>,
			ProviderValue<D>,
			ProviderValue<E>,
			ProviderValue<F>,
			ProviderValue<G>,
			ProviderValue<H>,
			ProviderValue<I>,
			ProviderValue<J>,
			ProviderValue<K>,
	  ]
	| [
			ProviderValue<A>,
			ProviderValue<B>,
			ProviderValue<C>,
			ProviderValue<D>,
			ProviderValue<E>,
			ProviderValue<F>,
			ProviderValue<G>,
			ProviderValue<H>,
			ProviderValue<I>,
			ProviderValue<J>,
			ProviderValue<K>,
			ProviderValue<L>,
	  ];

interface ProviderProps<A, B, C, D, E, F, G, H, I, J, K, L> {
	values: ProviderValues<A, B, C, D, E, F, G, H, I, J, K, L>;
	children: ReactNode;
}

// No hooks (Provider nests plain Context.Provider descriptors), so no slot threading. The
// descriptor `{ value, children }` shape stays stable per values entry (see aria memory
// octane-provider-children-shape-flip).
export function Provider<A, B, C, D, E, F, G, H, I, J, K, L>(
	props: ProviderProps<A, B, C, D, E, F, G, H, I, J, K, L>,
): any {
	let { values, children } = props;
	for (let [Context, value] of values) {
		children = createElement((Context as any).Provider, { value, children });
	}

	return children;
}

export interface StyleProps {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element.
	 */
	className?: string;
	/**
	 * The inline [style](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/style) for the
	 * element.
	 */
	style?: CSSProperties;
}

export interface DOMProps extends StyleProps, SharedDOMProps {
	/** The children of the component. */
	children?: ReactNode;
}

export type ClassNameOrFunction<T> =
	string | ((values: T & { defaultClassName: string | undefined }) => string);
type StyleOrFunction<T> =
	CSSProperties | ((values: T & { defaultStyle: CSSProperties }) => CSSProperties | undefined);

export interface StyleRenderProps<T, E extends string = 'div'> extends DOMRenderProps<E, T> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 */
	className?: ClassNameOrFunction<T>;
	/**
	 * The inline [style](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/style) for the
	 * element. A function may be provided to compute the style based on component state.
	 */
	style?: StyleOrFunction<T>;
}

export type ChildrenOrFunction<T> =
	ReactNode | ((values: T & { defaultChildren: ReactNode | undefined }) => ReactNode);

export interface RenderProps<T, E extends string = 'div'> extends StyleRenderProps<T, E> {
	/**
	 * The children of the component. A function may be provided to alter the children based on
	 * component state.
	 */
	children?: ChildrenOrFunction<T>;
}

interface RenderPropsHookOptions<T, E extends string>
	extends RenderProps<T, E>, SharedDOMProps, AriaLabelingProps {
	values: T;
	defaultChildren?: ReactNode;
	defaultClassName?: string;
	defaultStyle?: CSSProperties;
}

interface RenderPropsHookRetVal<T, E extends string> {
	className?: string;
	style?: CSSProperties;
	children?: ReactNode;
	'data-rac': string;
	render?: DOMRenderFunction<E, T>;
}

export function useRenderProps<T, E extends string = 'div'>(
	props: RenderPropsHookOptions<T, E>,
): RenderPropsHookRetVal<T, E>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useRenderProps<T, E extends string = 'div'>(
	props: RenderPropsHookOptions<T, E>,
	slot: symbol | undefined,
): RenderPropsHookRetVal<T, E>;
export function useRenderProps(...args: any[]): RenderPropsHookRetVal<any, any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useRenderProps');
	const props = user[0] as RenderPropsHookOptions<any, any>;

	let {
		className,
		style,
		children,
		defaultClassName = undefined,
		defaultChildren = undefined,
		defaultStyle,
		values,
		render,
	} = props;

	return useMemo(
		() => {
			let computedClassName: string | undefined;
			let computedStyle: CSSProperties | undefined;
			let computedChildren: ReactNode | undefined;

			if (typeof className === 'function') {
				computedClassName = className({ ...values, defaultClassName });
			} else {
				computedClassName = className;
			}

			if (typeof style === 'function') {
				computedStyle = style({ ...values, defaultStyle: defaultStyle || {} });
			} else {
				computedStyle = style;
			}

			if (typeof children === 'function') {
				computedChildren = children({ ...values, defaultChildren });
			} else if (children == null) {
				computedChildren = defaultChildren;
			} else {
				computedChildren = children;
			}

			return {
				className: computedClassName ?? defaultClassName,
				style: computedStyle || defaultStyle ? { ...defaultStyle, ...computedStyle } : undefined,
				children: computedChildren ?? defaultChildren,
				'data-rac': '',
				render: render ? (props: ElementProps) => render(props, values) : undefined,
			};
		},
		[className, style, children, defaultClassName, defaultChildren, defaultStyle, values, render],
		subSlot(slot, 'result'),
	);
}

/**
 * A helper function that accepts a user-provided render prop value (either a static value or a
 * function), and combines it with another value to create a final result.
 */
export function composeRenderProps<T, U, V extends T>(
	// https://stackoverflow.com/questions/60898079/typescript-type-t-or-function-t-usage
	value: T extends any ? T | ((renderProps: U) => V) : never,
	wrap: (prevValue: T, renderProps: U) => V,
): (renderProps: U) => V {
	return (renderProps) =>
		wrap(typeof value === 'function' ? (value as any)(renderProps) : value, renderProps);
}

export type WithRef<T, E> = T & { ref?: MergableRef<E> };
export interface SlotProps {
	/**
	 * A slot name for the component. Slots allow the component to receive props from a parent
	 * component. An explicit `null` value indicates that the local props completely override all
	 * props received from a parent.
	 */
	slot?: string | null;
}

// The user `slot` argument is a string | null | undefined — never a symbol; a trailing symbol
// is always the compiler-injected call-site slot and is stripped (useContext itself is
// context-identity keyed, so nothing here consumes it).
export function useSlottedContext<T>(
	context: Context<SlottedContextValue<T>>,
	slot?: string | null,
): T | null | undefined;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSlottedContext<T>(
	context: Context<SlottedContextValue<T>>,
	slot: string | null | undefined,
	slotSymbol: symbol | undefined,
): T | null | undefined;
export function useSlottedContext(...args: any[]): any {
	const [user] = splitSlot(args);
	const context = user[0] as Context<SlottedContextValue<any>>;
	const slot = user[1] as string | null | undefined;

	let ctx = useContext(context);
	if (slot === null) {
		// An explicit `null` slot means don't use context.
		return null;
	}
	if (ctx && typeof ctx === 'object' && 'slots' in ctx && ctx.slots) {
		let slotKey = slot || DEFAULT_SLOT;
		if (!ctx.slots[slotKey]) {
			let availableSlots = new Intl.ListFormat().format(
				Object.keys(ctx.slots).map((p) => `"${p}"`),
			);
			let errorMessage = slot ? `Invalid slot "${slot}".` : 'A slot prop is required.';

			throw new Error(`${errorMessage} Valid slot names are ${availableSlots}.`);
		}
		return ctx.slots[slotKey];
	}
	return ctx;
}

// octane ref-as-prop: `ref` is the caller's `props.ref`, passed explicitly so the merged object
// ref folds it in with the context ref. The local `ref` key is stripped from the returned merged
// props — spread the returned props and pass the returned ref separately, exactly like upstream.
export function useContextProps<T, U extends SlotProps, E extends Element>(
	props: T & SlotProps,
	ref: MergableRef<E> | undefined,
	context: Context<ContextValue<U, E>>,
): [T, MutableRefObject<E | null>];
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useContextProps<T, U extends SlotProps, E extends Element>(
	props: T & SlotProps,
	ref: MergableRef<E> | undefined,
	context: Context<ContextValue<U, E>>,
	slot: symbol | undefined,
): [T, MutableRefObject<E | null>];
export function useContextProps(...args: any[]): [any, MutableRefObject<any>] {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useContextProps');
	const props = user[0] as SlotProps & Record<string, any>;
	const ref = user[1] as MergableRef<any> | undefined;
	const context = user[2] as Context<ContextValue<any, any>>;

	let ctx = useSlottedContext(context, props.slot) || {};
	let { ref: contextRef, ...contextProps } = ctx as any;
	let mergedRef = useObjectRef(
		useMemo(() => mergeRefs(ref, contextRef), [ref, contextRef], subSlot(slot, 'mergeRefs')),
		subSlot(slot, 'objectRef'),
	);
	// octane adaptation: the local `ref` prop is already folded into `mergedRef` via the `ref`
	// argument above; keep it out of the merged props so a bare spread can't re-apply it.
	let { ref: _localRef, ...localProps } = props as any;
	let mergedProps = mergeProps(contextProps, localProps) as any;

	// mergeProps does not merge `style`. Adding this there might be a breaking change.
	if ('style' in contextProps && contextProps.style && 'style' in props && props.style) {
		if (typeof contextProps.style === 'function' || typeof props.style === 'function') {
			mergedProps.style = (renderProps: any) => {
				let contextStyle =
					typeof contextProps.style === 'function'
						? contextProps.style(renderProps)
						: contextProps.style;
				let defaultStyle = { ...renderProps.defaultStyle, ...contextStyle };
				let style =
					typeof props.style === 'function'
						? (props.style as any)({ ...renderProps, defaultStyle })
						: props.style;
				return { ...defaultStyle, ...style };
			};
		} else {
			mergedProps.style = { ...contextProps.style, ...props.style };
		}
	}

	return [mergedProps, mergedRef];
}

/**
 * Filters out `data-*` attributes to keep them from being passed down and duplicated.
 *
 * @param props
 */
export function removeDataAttributes<T>(props: T): T {
	const prefix = /^(data-.*)$/;
	let filteredProps = {} as T;

	for (const prop in props) {
		if (!prefix.test(prop)) {
			filteredProps[prop] = props[prop];
		}
	}

	return filteredProps;
}

// Override base type to change the default.
export interface RACValidation {
	/**
	 * Whether to use native HTML form validation to prevent form submission
	 * when the value is missing or invalid, or mark the field as required
	 * or invalid via ARIA.
	 *
	 * @default 'native'
	 */
	validationBehavior?: 'native' | 'aria';
}

export type DOMRenderFunction<E extends string, T> = (
	props: ElementProps,
	renderProps: T,
) => ReactElement;
export interface DOMRenderProps<E extends string, T> {
	/**
	 * Overrides the default DOM element with a custom render function.
	 * This allows rendering existing components with built-in styles and behaviors
	 * such as router links, animation libraries, and pre-styled components.
	 *
	 * Requirements:
	 *
	 * - You must render the expected element type (e.g. if `<button>` is expected, you cannot render an
	 *   `<a>`).
	 * - Only a single root DOM element can be rendered (no fragments).
	 * - You must pass through props and ref to the underlying DOM element, merging with your own prop
	 *   as appropriate.
	 */
	render?: DOMRenderFunction<E, T>;
}

// Same as DOMRenderProps but specific for the case where the element could be a 'a' or 'div' element.
export interface PossibleLinkDOMRenderProps<Fallback extends string, T> {
	/**
	 * Overrides the default DOM element with a custom render function.
	 * This allows rendering existing components with built-in styles and behaviors
	 * such as router links, animation libraries, and pre-styled components.
	 *
	 * Note: You can check if `'href' in props` in order to tell whether to render an `<a>` element.
	 *
	 * Requirements:
	 *
	 * - You must render the expected element type (e.g. if `<a>` is expected, you cannot render a
	 *   `<button>`).
	 * - Only a single root DOM element can be rendered (no fragments).
	 * - You must pass through props and ref to the underlying DOM element, merging with your own prop
	 *   as appropriate.
	 */
	render?: (props: ElementProps, renderProps: T) => ReactElement;
}

// octane adaptation: the forwarded ref arrives as `props.ref` (no forwardRef). The component
// runs in its own per-instance scope, so the shared S('DOMElement') slot is distinct per use.
function DOMElement(ElementType: string, props: DOMRenderProps<any, any> & ElementProps): any {
	const slot = S('DOMElement');
	let { render, ref: forwardedRef, ...otherProps } = props;
	let elementRef: MutableRefObject<HTMLElement | null> = useRef(null, subSlot(slot, 'element'));
	let ref = useMemo(
		() => mergeRefs(forwardedRef, elementRef),
		[forwardedRef, elementRef],
		subSlot(slot, 'ref'),
	);

	useLayoutEffect(
		() => {
			if (process.env.NODE_ENV !== 'production' && render) {
				if (!elementRef.current) {
					console.warn(
						'Ref was not connected to DOM element returned by custom `render` function. Did you forget to pass through or merge the `ref`?',
					);
				} else if (elementRef.current.localName !== ElementType) {
					console.warn(
						`Unexpected DOM element returned by custom \`render\` function. Expected <${ElementType}>, got <${elementRef.current.localName}>. This may break the component behavior and accessibility.`,
					);
				}
			}
		},
		[ElementType, render],
		subSlot(slot, 'validate'),
	);

	let domProps: any = { ...otherProps, ref };
	if (render) {
		return render(domProps, undefined);
	}

	return createElement(ElementType, domProps);
}

type DOMComponents = Record<string, (props: DOMRenderProps<any, any> & ElementProps) => any>;

const domComponentCache: Record<string, any> = {};

// Dynamically generates and caches components for each DOM element (e.g. `dom.button`).
export const dom = new Proxy(
	{},
	{
		get(target, elementType) {
			if (typeof elementType !== 'string') {
				return undefined;
			}

			let res = domComponentCache[elementType];
			if (!res) {
				res = DOMElement.bind(null, elementType);
				domComponentCache[elementType] = res;
			}

			return res;
		},
	},
) as DOMComponents;
