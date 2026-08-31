import {
	createContext,
	createPortal,
	memo,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from 'octane';
import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

export {
	createContext,
	createPortal,
	memo,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
};

export type { OctaneNode as ReactNode, OctaneNode };

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
export type Context<T> = { Provider: FC<{ value: T; children?: OctaneNode }> };

export type Dispatch<A> = (value: A) => void;
export type SetStateAction<S> = S | ((previous: S) => S);
export type DependencyList = ReadonlyArray<unknown>;

export type ReactElement = OctaneNode;
export type ReactMouseEvent<T = Element> = MouseEvent;
export type SyntheticEvent<T = Element> = Event;

export function forwardRef<T, P extends Record<string, unknown>>(
	render: (props: P & { ref?: Ref<T> }) => OctaneNode,
): FC<P & { ref?: Ref<T> }> {
	return render;
}

export namespace Octane {
	export namespace JSX {
		export type Element = OctaneNode;
	}
}

const React = {
	createContext,
	createPortal,
	memo,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	forwardRef,
};

export default React;
