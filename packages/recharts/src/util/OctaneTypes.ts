// DOM contracts shared by the authored Recharts port. Events are native,
// while element props and refs follow Octane's public JSX type surface.
import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

export type { OctaneNode } from 'octane';
export type { OctaneElement } from 'octane/jsx-runtime';
export type CSSProperties = Exclude<NonNullable<Octane.HTMLAttributes<Element>['style']>, string>;
export type SVGProps<T> = Octane.SVGProps<T>;
export type SVGAttributes<T> = Octane.SVGAttributes<T>;
export type HTMLAttributes<T> = Octane.HTMLAttributes<T>;
export type AriaAttributes = Pick<
	Octane.SVGAttributes<Element>,
	Extract<keyof Octane.SVGAttributes<Element>, `aria-${string}`>
>;
export type Ref<T> = Octane.Ref<T>;
// A renderer only writes its actual host into a broader SVG ref sink. This
// type-only view preserves the ref while narrowing that write at the boundary.
export type SVGPropsForHost<P, T extends SVGElement> = Omit<P, 'ref'> & { ref?: Ref<T> };
export type RefCallback<T> = (instance: T | null) => void | (() => void);
export type RefAttributes<T> = Octane.RefAttributes<T>;
export type PropsWithoutRef<P> = P extends unknown ? Omit<P, 'ref'> : never;
export type MutableRefObject<T> = { current: T };
export type RefObject<T> = { current: T };
export type ComponentType<P = {}> = ((props: P) => OctaneNode) & { displayName?: string };
export type FunctionComponent<P = {}> = ComponentType<P>;
export type FC<P = {}> = ComponentType<P>;
export type ComponentProps<C> = C extends (props: infer P) => unknown
	? P
	: C extends keyof Octane.JSX.IntrinsicElements
		? Octane.JSX.IntrinsicElements[C]
		: never;

export type NativeEvent<T = Element> = Event & { currentTarget: EventTarget & T };
export type NativeAnimationEvent<T = Element> = AnimationEvent & { currentTarget: EventTarget & T };
export type NativeClipboardEvent<T = Element> = ClipboardEvent & { currentTarget: EventTarget & T };
export type NativeCompositionEvent<T = Element> = CompositionEvent & {
	currentTarget: EventTarget & T;
};
export type NativeDragEvent<T = Element> = DragEvent & { currentTarget: EventTarget & T };
export type NativeFocusEvent<T = Element> = FocusEvent & { currentTarget: EventTarget & T };
export type NativeFormEvent<T = Element> = Event & { currentTarget: EventTarget & T };
export type NativeKeyboardEvent<T = Element> = KeyboardEvent & { currentTarget: EventTarget & T };
export type NativeMouseEvent<T = Element> = MouseEvent & { currentTarget: EventTarget & T };
export type NativePointerEvent<T = Element> = PointerEvent & { currentTarget: EventTarget & T };
export type NativeTouchEvent<T = Element> = TouchEvent & { currentTarget: EventTarget & T };
export type NativeTransitionEvent<T = Element> = TransitionEvent & {
	currentTarget: EventTarget & T;
};
export type NativeUIEvent<T = Element> = UIEvent & { currentTarget: EventTarget & T };
export type NativeWheelEvent<T = Element> = WheelEvent & { currentTarget: EventTarget & T };
