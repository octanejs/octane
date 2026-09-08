import type { ComponentBody, OctaneNode } from 'octane';
import type { Octane as OctaneJSXRuntime } from 'octane/jsx-runtime';

export type { OctaneNode as ReactNode, OctaneNode };

export type CSSProperties = Exclude<
	OctaneJSXRuntime.JSX.IntrinsicElements['div']['style'],
	string | undefined
>;

export type RefObject<T> = { current: T | null };
export type Ref<T> = OctaneJSXRuntime.Ref<T>;
export type RefAttributes<T> = { ref?: Ref<T> };
export type PropsWithoutRef<P> = P;

export type FC<P = Record<string, unknown>> = ComponentBody<P> & { displayName?: string };
export type ComponentType<P = Record<string, unknown>> = FC<P>;

type NativeEvent<T extends Element, E extends Event> = E & { readonly currentTarget: T };

export type MouseEvent<
	T extends Element = Element,
	E extends globalThis.MouseEvent = globalThis.MouseEvent,
> = NativeEvent<T, E>;
export type TouchEvent<
	T extends Element = Element,
	E extends globalThis.TouchEvent = globalThis.TouchEvent,
> = NativeEvent<T, E>;
export type KeyboardEvent<
	T extends Element = Element,
	E extends globalThis.KeyboardEvent = globalThis.KeyboardEvent,
> = NativeEvent<T, E>;
export type PointerEvent<
	T extends Element = Element,
	E extends globalThis.PointerEvent = globalThis.PointerEvent,
> = NativeEvent<T, E>;
export type WheelEvent<
	T extends Element = Element,
	E extends globalThis.WheelEvent = globalThis.WheelEvent,
> = NativeEvent<T, E>;
export type UIEvent<
	T extends Element = Element,
	E extends globalThis.UIEvent = globalThis.UIEvent,
> = NativeEvent<T, E>;
export type EventHandler<E extends Event> = (event: E) => void;
export type MouseEventHandler<T extends Element = Element> = EventHandler<MouseEvent<T>>;

export type HTMLAttributes<T extends Element = Element> = Partial<{
	id: string;
	class: string;
	className: string;
	title: string;
	style: CSSProperties;
	role: string;
	tabIndex: number;
	'aria-label': string;
	'aria-hidden': boolean | 'true' | 'false';
	draggable: boolean;
	onClick: (event: MouseEvent<T>) => void;
	onContextMenu: (event: MouseEvent<T>) => void;
	onDoubleClick: (event: MouseEvent<T>) => void;
	onMouseDown: (event: MouseEvent<T>) => void;
	onMouseMove: (event: MouseEvent<T>) => void;
	onMouseUp: (event: MouseEvent<T>) => void;
	onMouseEnter: (event: MouseEvent<T>) => void;
	onMouseLeave: (event: MouseEvent<T>) => void;
	onWheel: (event: WheelEvent<T>) => void;
	onKeyDown: (event: KeyboardEvent<T>) => void;
	onKeyUp: (event: KeyboardEvent<T>) => void;
	onFocus: (event: FocusEvent) => void;
	onBlur: (event: FocusEvent) => void;
	onScroll: (event: UIEvent<T>) => void;
	onPointerDown: (event: PointerEvent<T>) => void;
	onTouchStart: (event: TouchEvent<T>) => void;
	children: OctaneNode;
}>;

export type DOMAttributes<T extends Element = Element> = HTMLAttributes<T>;
export type SVGAttributes<T extends Element = Element> = HTMLAttributes<T>;
export type ButtonHTMLAttributes<T extends HTMLButtonElement = HTMLButtonElement> =
	HTMLAttributes<T> &
		Partial<{
			disabled: boolean;
			name: string;
			type: 'button' | 'reset' | 'submit';
			value: string | number;
		}>;
export type AriaRole = string;
export type ReactMouseEvent<T extends Element = Element> = MouseEvent<T>;
export type ReactTouchEvent<T extends Element = Element> = TouchEvent<T>;
export type Dispatch<A> = (value: A) => void;
export type SetStateAction<S> = S | ((previous: S) => S);
export type ForwardedRef<T> = ((instance: T | null) => void) | { current: T | null } | null;
