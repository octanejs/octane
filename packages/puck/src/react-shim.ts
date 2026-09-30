import {
	createContext,
	createPortal,
	isValidElement,
	memo,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useTransition,
} from 'octane';
import type { Context as OctaneContext, OctaneNode } from 'octane';
import type { JSX, Octane } from 'octane/jsx-runtime';

export {
	createContext,
	createPortal,
	isValidElement,
	memo,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useTransition,
};

export type { JSX, Octane, OctaneNode as ReactNode, OctaneNode };

export type CSSProperties = Exclude<
	Octane.JSX.IntrinsicElements['div']['style'],
	string | undefined
>;

export type RefObject<T> = { current: T | null };
export type Ref<T> = Octane.Ref<T>;
export type RefAttributes<T> = { ref?: Ref<T> };
export type ForwardedRef<T> = Ref<T>;
export type PropsWithoutRef<P> = P;
export type PropsWithChildren<P = Record<string, unknown>> = P & { children?: OctaneNode };

export type FC<P = Record<string, unknown>> = (props: P) => OctaneNode;
export type ComponentType<P = Record<string, unknown>> = FC<P>;

export type Reducer<S, A> = (state: S, action: A) => S;
export type Context<T> = OctaneContext<T>;

export type Dispatch<A> = (value: A) => void;
export type SetStateAction<S> = S | ((previous: S) => S);
export type DependencyList = ReadonlyArray<unknown>;

export type ReactElement = OctaneNode;
export type ReactMouseEvent<T = Element> = MouseEvent;
export type SyntheticEvent<T = Element> = Event;

// Octane passes `ref` as an ordinary prop, so upstream's `forwardRef` render
// functions get it back as their second argument here. Returning `render`
// itself would call it with props alone and drop every forwarded ref.
export function forwardRef<T, P = Record<string, unknown>>(
	render: (props: P, ref: ForwardedRef<T>) => OctaneNode,
): FC<P & RefAttributes<T>> {
	return function ForwardRef(props) {
		return render(props, props.ref ?? null);
	};
}

const React = {
	createContext,
	createPortal,
	isValidElement,
	memo,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useTransition,
	forwardRef,
};

export default React;
