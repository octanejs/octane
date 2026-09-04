/** React-shaped type names describing Octane values and native DOM events. */
import type * as React from 'react';
import type { Octane } from './jsx-runtime.js';
import type {
	Activity,
	Context,
	ElementDescriptor,
	OctaneNode,
	PortalDescriptor,
	Suspense,
} from './runtime.js';

export type { JSX, Octane, OctaneElement, ClassValue, CSSProperties } from './jsx-runtime.js';

/** Migration alias. New Octane code should use OctaneNode. */
export type ReactNode = OctaneNode;
export type ReactElement<
	P = any,
	T extends ElementDescriptor<P>['type'] = ElementDescriptor<P>['type'],
> = ElementDescriptor<P> & { type: T };
export type ReactPortal = PortalDescriptor;
export type FunctionComponentElement<P> = ReactElement<P, FunctionComponent<P>>;
export type DOMElement<P, T extends Element> = ReactElement<P, string> & { ref?: Ref<T> };
export type DetailedReactHTMLElement<
	P extends HTMLAttributes<T>,
	T extends HTMLElement,
> = DOMElement<P, T>;
export type ReactHTMLElement<T extends HTMLElement> = DetailedReactHTMLElement<
	AllHTMLAttributes<T>,
	T
>;
export type ReactSVGElement = DOMElement<SVGAttributes<SVGElement>, SVGElement>;
export type Key = Octane.Key;
export type Ref<T> = Octane.Ref<T>;
export type RefCallback<T> = React.RefCallback<T>;
export interface RefObject<T> {
	current: T;
}
export interface MutableRefObject<T> {
	current: T;
}
export type Attributes = Octane.Attributes;
export type RefAttributes<T> = Octane.RefAttributes<T>;
export type PropsWithChildren<P = unknown> = P & { children?: OctaneNode };
export type PropsWithoutRef<P> = P extends unknown
	? 'ref' extends keyof P
		? Omit<P, 'ref'>
		: P
	: P;
export type PropsWithRef<P> = P;
export type SetStateAction<S> = S | ((previous: S) => S);
export type Dispatch<A> = (value: A) => void;
export type DispatchWithoutAction = () => void;
export type DependencyList = readonly unknown[];
export type EffectCallback = () => void | (() => void);
export type Destructor = () => void;
export type Reducer<S, A> = (state: S, action: A) => S;
export type ReducerWithoutAction<S> = (state: S) => S;
export type ReducerState<R extends Reducer<any, any>> = R extends Reducer<infer S, any> ? S : never;
export type ReducerAction<R extends Reducer<any, any>> =
	R extends Reducer<any, infer A> ? A : never;
export type ReducerStateWithoutAction<R extends ReducerWithoutAction<any>> =
	R extends ReducerWithoutAction<infer S> ? S : never;
export interface FunctionComponent<P = {}> {
	(props: P): OctaneNode;
	displayName?: string;
}
export type FC<P = {}> = FunctionComponent<P>;
export type ComponentType<P = {}> = FunctionComponent<P>;
/** Octane boundary and memo wrappers are callable components, without React branding. */
export type ExoticComponent<P = {}> = FunctionComponent<P>;
export type NamedExoticComponent<P = {}> = FunctionComponent<P>;
export type MemoExoticComponent<T extends ComponentType<any>> = FunctionComponent<
	ComponentProps<T>
> & { readonly type: T };
export type LazyExoticComponent<T extends ComponentType<any>> = FunctionComponent<
	ComponentProps<T>
>;
export type JSXElementConstructor<P> = (props: P, ...args: any[]) => OctaneNode;
export type ElementType<
	P = any,
	Tag extends keyof Octane.JSX.IntrinsicElements = keyof Octane.JSX.IntrinsicElements,
> = { [K in Tag]: P extends Octane.JSX.IntrinsicElements[K] ? K : never }[Tag] | ComponentType<P>;
export type ComponentProps<
	T extends keyof Octane.JSX.IntrinsicElements | JSXElementConstructor<any>,
> =
	T extends JSXElementConstructor<infer P>
		? P
		: T extends keyof Octane.JSX.IntrinsicElements
			? Octane.JSX.IntrinsicElements[T]
			: never;
export type ComponentPropsWithRef<T extends ElementType> = ComponentProps<T>;
export type ComponentPropsWithoutRef<T extends ElementType> = PropsWithoutRef<ComponentProps<T>>;
export type CustomComponentPropsWithRef<T extends ComponentType<any>> = ComponentProps<T>;
export type ComponentRef<T extends ElementType> =
	ComponentProps<T> extends { ref?: Ref<infer Instance> } ? Instance : never;
export type ElementRef<T extends ElementType> = ComponentRef<T>;
export type ContextType<C extends Context<any>> = C extends Context<infer T> ? T : never;
export type Provider<T> = Context<T>['Provider'];
export interface ProviderProps<T> {
	value: T;
	children?: OctaneNode;
}
export type SuspenseProps = Parameters<typeof Suspense>[0];
export type ActivityProps = Parameters<typeof Activity>[0];
export interface StrictModeProps {
	children?: OctaneNode;
}
export type AriaAttributes = React.AriaAttributes;
export type AriaRole = React.AriaRole;
export type HTMLInputTypeAttribute = React.HTMLInputTypeAttribute;
export type HTMLAttributeReferrerPolicy = React.HTMLAttributeReferrerPolicy;
export type HTMLAttributeAnchorTarget = React.HTMLAttributeAnchorTarget;
export type Booleanish = boolean | 'true' | 'false';
export type CrossOrigin = '' | 'anonymous' | 'use-credentials' | undefined;
export type DetailedHTMLProps<E, T> = Octane.DetailedHTMLProps<E, T>;
export type HTMLProps<T> = Octane.DetailedHTMLProps<Octane.AllHTMLAttributes<T>, T>;
export type SVGProps<T> = Octane.SVGProps<T>;
export type SVGLineElementAttributes<T> = Octane.SVGLineElementAttributes<T>;
export type SVGTextElementAttributes<T> = Octane.SVGTextElementAttributes<T>;

/** The currentTarget is the host whose listener is currently being invoked. */
export type NativeEvent<T = Element, E extends Event = Event> = E & {
	currentTarget: T & EventTarget;
};
export type EventHandler<E extends Event> = { bivarianceHack(event: E): void }['bivarianceHack'];
export type AnchorHTMLAttributes<T> = Octane.AnchorHTMLAttributes<T>;
export type AreaHTMLAttributes<T> = Octane.AreaHTMLAttributes<T>;
export type AudioHTMLAttributes<T> = Octane.AudioHTMLAttributes<T>;
export type BaseHTMLAttributes<T> = Octane.BaseHTMLAttributes<T>;
export type BlockquoteHTMLAttributes<T> = Octane.BlockquoteHTMLAttributes<T>;
export type ButtonHTMLAttributes<T> = Octane.ButtonHTMLAttributes<T>;
export type CanvasHTMLAttributes<T> = Octane.CanvasHTMLAttributes<T>;
export type ColHTMLAttributes<T> = Octane.ColHTMLAttributes<T>;
export type ColgroupHTMLAttributes<T> = Octane.ColgroupHTMLAttributes<T>;
export type DataHTMLAttributes<T> = Octane.DataHTMLAttributes<T>;
export type DelHTMLAttributes<T> = Octane.DelHTMLAttributes<T>;
export type DetailsHTMLAttributes<T> = Octane.DetailsHTMLAttributes<T>;
export type DialogHTMLAttributes<T> = Octane.DialogHTMLAttributes<T>;
export type EmbedHTMLAttributes<T> = Octane.EmbedHTMLAttributes<T>;
export type FieldsetHTMLAttributes<T> = Octane.FieldsetHTMLAttributes<T>;
export type FormHTMLAttributes<T> = Octane.FormHTMLAttributes<T>;
export type HTMLAttributes<T> = Octane.HTMLAttributes<T>;
export type AllHTMLAttributes<T> = Octane.AllHTMLAttributes<T>;
export type HtmlHTMLAttributes<T> = Octane.HtmlHTMLAttributes<T>;
export type IframeHTMLAttributes<T> = Octane.IframeHTMLAttributes<T>;
export type ImgHTMLAttributes<T> = Octane.ImgHTMLAttributes<T>;
export type InputHTMLAttributes<T> = Octane.InputHTMLAttributes<T>;
export type InsHTMLAttributes<T> = Octane.InsHTMLAttributes<T>;
export type KeygenHTMLAttributes<T> = Octane.KeygenHTMLAttributes<T>;
export type LabelHTMLAttributes<T> = Octane.LabelHTMLAttributes<T>;
export type LiHTMLAttributes<T> = Octane.LiHTMLAttributes<T>;
export type LinkHTMLAttributes<T> = Octane.LinkHTMLAttributes<T>;
export type MapHTMLAttributes<T> = Octane.MapHTMLAttributes<T>;
export type MenuHTMLAttributes<T> = Octane.MenuHTMLAttributes<T>;
export type MetaHTMLAttributes<T> = Octane.MetaHTMLAttributes<T>;
export type MeterHTMLAttributes<T> = Octane.MeterHTMLAttributes<T>;
export type ObjectHTMLAttributes<T> = Octane.ObjectHTMLAttributes<T>;
export type OlHTMLAttributes<T> = Octane.OlHTMLAttributes<T>;
export type OptgroupHTMLAttributes<T> = Octane.OptgroupHTMLAttributes<T>;
export type OptionHTMLAttributes<T> = Octane.OptionHTMLAttributes<T>;
export type OutputHTMLAttributes<T> = Octane.OutputHTMLAttributes<T>;
export type ParamHTMLAttributes<T> = Octane.ParamHTMLAttributes<T>;
export type ProgressHTMLAttributes<T> = Octane.ProgressHTMLAttributes<T>;
export type QuoteHTMLAttributes<T> = Octane.QuoteHTMLAttributes<T>;
export type SVGAttributes<T> = Octane.SVGAttributes<T>;
export type ScriptHTMLAttributes<T> = Octane.ScriptHTMLAttributes<T>;
export type SelectHTMLAttributes<T> = Octane.SelectHTMLAttributes<T>;
export type SlotHTMLAttributes<T> = Octane.SlotHTMLAttributes<T>;
export type SourceHTMLAttributes<T> = Octane.SourceHTMLAttributes<T>;
export type StyleHTMLAttributes<T> = Octane.StyleHTMLAttributes<T>;
export type TableHTMLAttributes<T> = Octane.TableHTMLAttributes<T>;
export type TdHTMLAttributes<T> = Octane.TdHTMLAttributes<T>;
export type TextareaHTMLAttributes<T> = Octane.TextareaHTMLAttributes<T>;
export type ThHTMLAttributes<T> = Octane.ThHTMLAttributes<T>;
export type TimeHTMLAttributes<T> = Octane.TimeHTMLAttributes<T>;
export type TrackHTMLAttributes<T> = Octane.TrackHTMLAttributes<T>;
export type VideoHTMLAttributes<T> = Octane.VideoHTMLAttributes<T>;
export type WebViewHTMLAttributes<T> = Octane.WebViewHTMLAttributes<T>;

export type ClipboardEvent<T = Element> = NativeEvent<T, globalThis.ClipboardEvent>;
export type ClipboardEventHandler<T = Element> = EventHandler<ClipboardEvent<T>>;
export type CompositionEvent<T = Element> = NativeEvent<T, globalThis.CompositionEvent>;
export type CompositionEventHandler<T = Element> = EventHandler<CompositionEvent<T>>;
export type DragEvent<T = Element> = NativeEvent<T, globalThis.DragEvent>;
export type DragEventHandler<T = Element> = EventHandler<DragEvent<T>>;
export type FocusEvent<T = Element> = NativeEvent<T, globalThis.FocusEvent>;
export type FocusEventHandler<T = Element> = EventHandler<FocusEvent<T>>;
export type FormEvent<T = Element> = NativeEvent<T, globalThis.Event>;
export type FormEventHandler<T = Element> = EventHandler<FormEvent<T>>;
export type ChangeEvent<T = Element> = NativeEvent<T, globalThis.Event>;
export type ChangeEventHandler<T = Element> = EventHandler<ChangeEvent<T>>;
export type InputEvent<T = Element> = NativeEvent<T, globalThis.InputEvent>;
export type InputEventHandler<T = Element> = EventHandler<InputEvent<T>>;
export type InvalidEvent<T = Element> = NativeEvent<T, globalThis.Event>;
export type InvalidEventHandler<T = Element> = EventHandler<InvalidEvent<T>>;
export type KeyboardEvent<T = Element> = NativeEvent<T, globalThis.KeyboardEvent>;
export type KeyboardEventHandler<T = Element> = EventHandler<KeyboardEvent<T>>;
export type MouseEvent<T = Element> = NativeEvent<T, globalThis.MouseEvent>;
export type MouseEventHandler<T = Element> = EventHandler<MouseEvent<T>>;
export type TouchEvent<T = Element> = NativeEvent<T, globalThis.TouchEvent>;
export type TouchEventHandler<T = Element> = EventHandler<TouchEvent<T>>;
export type PointerEvent<T = Element> = NativeEvent<T, globalThis.PointerEvent>;
export type PointerEventHandler<T = Element> = EventHandler<PointerEvent<T>>;
export type UIEvent<T = Element> = NativeEvent<T, globalThis.UIEvent>;
export type UIEventHandler<T = Element> = EventHandler<UIEvent<T>>;
export type WheelEvent<T = Element> = NativeEvent<T, globalThis.WheelEvent>;
export type WheelEventHandler<T = Element> = EventHandler<WheelEvent<T>>;
export type AnimationEvent<T = Element> = NativeEvent<T, globalThis.AnimationEvent>;
export type AnimationEventHandler<T = Element> = EventHandler<AnimationEvent<T>>;
export type TransitionEvent<T = Element> = NativeEvent<T, globalThis.TransitionEvent>;
export type TransitionEventHandler<T = Element> = EventHandler<TransitionEvent<T>>;
export type ToggleEvent<T = Element> = NativeEvent<T, globalThis.Event>;
export type ToggleEventHandler<T = Element> = EventHandler<ToggleEvent<T>>;
export type DOMAttributes<T> = Pick<
	Octane.HTMLAttributes<T>,
	Extract<keyof Octane.HTMLAttributes<T>, `on${string}`> | 'children' | 'dangerouslySetInnerHTML'
>;
