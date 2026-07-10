import {
	Children as _missingChildren,
	cloneElement as _missingCloneElement,
	isValidElement as _missingIsValidElement,
} from 'octane';
import {
	ErrorBoundary,
	Suspense as OctaneSuspense,
	createContext as octaneCreateContext,
	createElement as octaneCreateElement,
	memo,
	startTransition,
	use,
	useActionState,
	useCallback,
	useContext,
	useEffect,
	useEffectEvent,
	useFormStatus,
	useId,
	useImperativeHandle,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useOptimistic,
	useReducer,
	useRef,
	useState,
	useTransition,
	type Context,
} from 'octane/server';

export const Children = _missingChildren;
export const cloneElement = _missingCloneElement;
export const isValidElement = _missingIsValidElement;

export {
	ErrorBoundary,
	memo,
	startTransition,
	use,
	useActionState,
	useCallback,
	useContext,
	useEffect,
	useEffectEvent,
	useFormStatus,
	useId,
	useImperativeHandle,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useOptimistic,
	useReducer,
	useRef,
	useState,
	useTransition,
};

export const version = '19.2.0-octane-compat';

export function Suspense(props: any, scope: any): string {
	try {
		return OctaneSuspense(props, scope);
	} catch (cause) {
		throw new Error(
			'[react-compat] React Suspense server-error fallback recovery is not supported. ' +
				'Octane SSR propagates render errors; catch them at the request/render boundary.',
			{ cause },
		);
	}
}

export function useDeferredValue<T>(value: T, initialValue?: T): T {
	return arguments.length >= 2 ? (initialValue as T) : value;
}

export function useSyncExternalStore<T>(
	_subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => T,
	getServerSnapshot?: () => T,
): T {
	// Do not forward the uncompiled 3-argument call to runtime.server's
	// compiler ABI (where a fourth trailing slot distinguishes the server getter).
	return getServerSnapshot ? getServerSnapshot() : getSnapshot();
}

export function useDebugValue(): void {}

export function createRef<T>(): { current: T | null } {
	return { current: null };
}

export function createContext<T>(defaultValue: T): Context<T> & {
	Consumer: (props: { children: (value: T) => unknown }) => unknown;
} {
	const context = octaneCreateContext(defaultValue) as Context<T> & {
		Consumer: (props: { children: (value: T) => unknown }) => unknown;
	};
	context.Consumer = (props) => props.children(useContext(context));
	return context;
}

export function Fragment(props: { children?: unknown }): unknown {
	return props.children ?? null;
}

export function forwardRef<T, P extends object>(
	render: (props: P, ref: T | null) => unknown,
): (props: P & { ref?: T | null }) => unknown {
	return (props) => render(props, props.ref ?? null);
}

export function StrictMode(props: { children?: unknown }): unknown {
	return props.children ?? null;
}

export const Profiler = StrictMode;

export function lazy<T extends (props: any) => unknown>(
	load: () => Promise<{ default: T }>,
): (props: Parameters<T>[0]) => unknown {
	let request: Promise<{ default: T }> | undefined;
	return function Lazy(props) {
		return createElement(use((request ??= load())).default as never, props as never);
	};
}

export class Component<P = any, S = any> {
	state!: S;
	context: any;
	constructor(
		public props: P,
		context?: any,
	) {
		this.context = context;
	}
	setState(update: Partial<S> | ((state: S, props: P) => Partial<S>)): void {
		const partial = typeof update === 'function' ? update(this.state, this.props) : update;
		if (partial != null) this.state = { ...this.state, ...partial };
	}
}
export class PureComponent<P = any, S = any> extends Component<P, S> {}

type ServerClassType = (new (
	props: any,
	context?: any,
) => Component & {
	render(): unknown;
}) & {
	contextType?: Context<any>;
	defaultProps?: Record<string, unknown>;
	getDerivedStateFromProps?: (props: any, state: any) => any;
};
const SERVER_CLASS_ADAPTERS = new WeakMap<Function, (props: any) => unknown>();
const SERVER_CONTEXT_TAG = Symbol.for('octane.context');

export function resolveServerCompatType(type: any): any {
	if (type?.$$kind === SERVER_CONTEXT_TAG) return type.Provider;
	if (typeof type !== 'function' || typeof type.prototype?.render !== 'function') return type;
	let adapter = SERVER_CLASS_ADAPTERS.get(type);
	if (!adapter) {
		const Type = type as ServerClassType;
		adapter = function ServerClassAdapter(props: any) {
			const instance = new Type(props, undefined);
			if (Type.contextType) instance.context = useContext(Type.contextType);
			const derived = Type.getDerivedStateFromProps?.(props, instance.state);
			if (derived != null) instance.state = { ...instance.state, ...derived };
			return instance.render();
		};
		SERVER_CLASS_ADAPTERS.set(type, adapter);
	}
	return adapter;
}

export function createElement(type: any, props?: any, ...children: any[]): unknown {
	let nextProps = props;
	if (typeof type?.prototype?.render === 'function' && type.defaultProps != null) {
		nextProps = { ...(nextProps ?? {}) };
		for (const name in type.defaultProps) {
			if (nextProps[name] === undefined) nextProps[name] = type.defaultProps[name];
		}
	}
	return octaneCreateElement(resolveServerCompatType(type), nextProps, ...children);
}

const React = {
	Children,
	Component,
	ErrorBoundary,
	Fragment,
	Profiler,
	PureComponent,
	StrictMode,
	Suspense,
	cloneElement,
	createContext,
	createElement,
	createRef,
	forwardRef,
	isValidElement,
	lazy,
	memo,
	startTransition,
	use,
	useActionState,
	useCallback,
	useContext,
	useDebugValue,
	useDeferredValue,
	useEffect,
	useEffectEvent,
	useFormStatus,
	useId,
	useImperativeHandle,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useOptimistic,
	useReducer,
	useRef,
	useState,
	useSyncExternalStore,
	useTransition,
	version,
};

export default React;
