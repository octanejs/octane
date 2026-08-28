// Compatibility types and the one React wrapper needed while porting the pinned
// React Aria Components source. Runtime hooks and element helpers are re-exported
// from Octane; forwardRef is an ordinary ref-as-prop adapter, not a React-style
// exotic component.
import * as Octane from 'octane';

export * from 'octane';

// React permits `useRef<Element>(null)`. Octane has the same runtime shape but
// infers the initializer literally, so expose the React-compatible overload at
// this import boundary while keeping the call visible to the Octane compiler.
export const useRef = Octane.useRef as <T>(initial: T | null) => { current: T };

export type ForwardedRef<T> =
	((instance: T | null) => void | (() => void)) | { current: T | null } | null;
export type ReactNode = any;
export type ReactElement = any;
export type CSSProperties = Record<string, any>;
export type PointerEvent<T = Element> = Omit<
	globalThis.PointerEvent,
	'currentTarget' | 'target'
> & {
	currentTarget: T;
	target: EventTarget & T;
	nativeEvent: globalThis.PointerEvent;
};
export type MouseEvent<T = Element> = Omit<globalThis.MouseEvent, 'currentTarget' | 'target'> & {
	currentTarget: T;
	target: EventTarget & T;
	nativeEvent: globalThis.MouseEvent;
};
export type HTMLAttributes<T = HTMLElement> = Record<string, any>;
export type InputHTMLAttributes<T = HTMLInputElement> = Record<string, any>;
export type LabelHTMLAttributes<T = HTMLLabelElement> = Record<string, any>;
export type DOMAttributes<T = Element> = Record<string, any>;
export type MutableRefObject<T> = { current: T };
export type RefObject<T> = { current: T };
export type Ref<T> = ForwardedRef<T>;
export type RefAttributes<T> = { ref?: ForwardedRef<T> };
export type ForwardRefExoticComponent<P> = (props: P) => any;
export type KeyboardEvent<T = Element> = Omit<
	globalThis.KeyboardEvent,
	'currentTarget' | 'target'
> & {
	currentTarget: T;
	target: EventTarget & T;
	nativeEvent: globalThis.KeyboardEvent;
};
export type ChangeEvent<T = Element> = globalThis.Event & {
	currentTarget: T;
	target: EventTarget & T;
};
export type DragEvent<T = Element> = Omit<
	globalThis.DragEvent,
	'currentTarget' | 'target' | 'dataTransfer'
> & {
	currentTarget: T;
	target: EventTarget & T;
	dataTransfer: DataTransfer;
	nativeEvent: globalThis.DragEvent;
};

export namespace JSX {
	export type Element = any;
}

type ForwardRefRenderFunction<T, P> = (props: P, ref: ForwardedRef<T>) => any;

/**
 * Adapts an upstream `forwardRef(render)` declaration to Octane's ref-as-prop
 * model. The returned value is an ordinary component and the ref remains a
 * normal prop at the public boundary.
 */
export function forwardRef<T, P = Record<string, never>>(
	render: ForwardRefRenderFunction<T, P>,
): (props: P & { ref?: ForwardedRef<T> }) => any {
	const component = (props: P & { ref?: ForwardedRef<T> }) => render(props, props.ref ?? null);
	Object.defineProperty(component, 'name', {
		configurable: true,
		value: render.name || 'ForwardRef',
	});
	return component;
}

const React = Object.assign({}, Octane, { forwardRef, useRef });

namespace React {
	export type ForwardedRef<T> = import('./react').ForwardedRef<T>;
	export type ReactNode = import('./react').ReactNode;
	export type ReactElement = import('./react').ReactElement;
	export type CSSProperties = import('./react').CSSProperties;
	export type HTMLAttributes<T = HTMLElement> = import('./react').HTMLAttributes<T>;
	export type InputHTMLAttributes<T = HTMLInputElement> = import('./react').InputHTMLAttributes<T>;
	export type LabelHTMLAttributes<T = HTMLLabelElement> = import('./react').LabelHTMLAttributes<T>;
	export type DOMAttributes<T = Element> = import('./react').DOMAttributes<T>;
	export type RefObject<T> = import('./react').RefObject<T>;
	export type Ref<T> = import('./react').Ref<T>;
	export type RefAttributes<T> = import('./react').RefAttributes<T>;
	export type ForwardRefExoticComponent<P> = import('./react').ForwardRefExoticComponent<P>;
	export type PointerEvent<T = Element> = import('./react').PointerEvent<T>;
	export type MouseEvent<T = Element> = import('./react').MouseEvent<T>;
	export type KeyboardEvent<T = Element> = import('./react').KeyboardEvent<T>;
	export type DragEvent<T = Element> = import('./react').DragEvent<T>;
	export type ChangeEvent<T = Element> = import('./react').ChangeEvent<T>;
	export type TouchEvent<T = Element> = globalThis.TouchEvent & {
		currentTarget: T;
		target: EventTarget & T;
	};
}

export default React;
