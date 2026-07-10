/**
 * Drop-in `react` facade for already-compiled React packages.
 *
 * Octane's native compiler gives every hook call site a stable symbol. Code in
 * node_modules has already been compiled for React, so these wrappers allocate
 * the same symbols by React's per-component call order. The state still lives in
 * Octane scopes and updates still use Octane's scheduler/rendering pipeline.
 */
import {
	Activity,
	Children,
	ErrorBoundary,
	Suspense,
	beginCompatHookRender,
	cloneElement,
	createContext as octaneCreateContext,
	createElement as octaneCreateElement,
	isValidElement,
	finishCompatHookRender,
	memo as octaneMemo,
	nextCompatHookSlot,
	startTransition,
	use as octaneUse,
	useActionState as octaneUseActionState,
	useCallback as octaneUseCallback,
	useContext,
	useDeferredValue as octaneUseDeferredValue,
	useEffect as octaneUseEffect,
	useEffectEvent as octaneUseEffectEvent,
	useFormStatus as octaneUseFormStatus,
	useId as octaneUseId,
	useImperativeHandle as octaneUseImperativeHandle,
	useInsertionEffect as octaneUseInsertionEffect,
	useLayoutEffect as octaneUseLayoutEffect,
	useMemo as octaneUseMemo,
	useOptimistic as octaneUseOptimistic,
	useReducer as octaneUseReducer,
	useRef as octaneUseRef,
	useState as octaneUseState,
	useSyncExternalStore as octaneUseSyncExternalStore,
	useTransition as octaneUseTransition,
	type Context,
	type FormStatus,
} from 'octane';

export {
	Activity,
	Children,
	ErrorBoundary,
	Suspense,
	cloneElement,
	isValidElement,
	startTransition,
	useContext,
};

export const version = '19.2.0-octane-compat';

export const octaneCompatibility = Object.freeze({
	supported: Object.freeze([
		'function-components',
		'hooks',
		'class-error-boundaries',
		'class-state-and-commit-lifecycles',
		'context',
		'suspense-and-lazy',
		'controlled-form-properties',
		'portals',
		'refs',
	]),
	partial: Object.freeze({
		classComponents:
			'PureComponent/shouldComponentUpdate bailout timing is not emulated; common state and commit lifecycles are supported.',
		errorBoundaryInfo:
			'componentDidCatch receives the Error and an empty componentStack; Octane does not build React fiber stacks.',
		syntheticEvents:
			'The common SyntheticEvent methods are provided; React event plugins, pooling and obscure polyfills are not emulated.',
		controlledModeWarnings:
			'Controlled properties are enforced, but React development warnings for controlled/uncontrolled switches are not emulated.',
	}),
	unsupported: Object.freeze({
		strictModeDoubleInvoke:
			'StrictMode is an inert wrapper; development double invocation is not emulated.',
		legacyClassLifecycles:
			'Legacy/UNSAFE pre-render lifecycles and getSnapshotBeforeUpdate throw a targeted error.',
		reactServerComponents:
			'React Server Components and React private renderer internals are unsupported.',
		synchronousReactDomServer:
			'ReactDOMServer synchronous/streaming APIs are unsupported; use octane/server render().',
		suspenseServerErrorRecovery:
			'React can emit a Suspense fallback for server render errors and retry on the client; Octane SSR reports a targeted error instead.',
	}),
});

const CONTEXT_TAG = Symbol.for('octane.context');
const COMPAT_PROPS = Symbol.for('octane.react-compat.props');
const MANAGED_COMPONENT = Symbol.for('octane.react-compat.managed');
const EVENT_WRAPPERS = new WeakMap<Function, Map<string, (event: Event) => unknown>>();
const FUNCTION_ADAPTERS = new WeakMap<Function, (props: any) => unknown>();

function syntheticEvent<T extends Event>(event: T): T {
	const value = event as any;
	if (value.nativeEvent === undefined) {
		value.nativeEvent = event;
		value.isDefaultPrevented = () => event.defaultPrevented;
		value.isPropagationStopped = () => event.cancelBubble;
		value.persist = () => {};
	}
	return value;
}

function wrapEventHandler(
	name: string,
	handler: (event: any) => unknown,
): (event: Event) => unknown {
	let byName = EVENT_WRAPPERS.get(handler);
	if (!byName) {
		byName = new Map();
		EVENT_WRAPPERS.set(handler, byName);
	}
	let wrapped = byName.get(name);
	if (!wrapped) {
		wrapped = (event) => handler(syntheticEvent(event));
		byName.set(name, wrapped);
	}
	return wrapped;
}

function compatHostProps(type: string, props: any): any {
	const next = props == null || typeof props !== 'object' ? {} : { ...props };
	Object.defineProperty(next, COMPAT_PROPS, { value: true, enumerable: true });
	for (const name in next) {
		const c = name.charCodeAt(2);
		if (
			name.charCodeAt(0) === 111 &&
			name.charCodeAt(1) === 110 &&
			c >= 65 &&
			c <= 90 &&
			typeof next[name] === 'function'
		) {
			next[name] = wrapEventHandler(name, next[name]);
		}
	}
	if (
		next.onChange != null &&
		next.onInput == null &&
		(type === 'textarea' ||
			(type === 'input' &&
				next.type !== 'checkbox' &&
				next.type !== 'radio' &&
				next.type !== 'file'))
	) {
		// Use only `input` for text controls. Keeping native `change` too would
		// invoke a React onChange twice (per-keystroke, then again on commit/blur).
		next.onInput = next.onChange;
		delete next.onChange;
	}
	return next;
}

export function useState<T>(initial: T | (() => T)) {
	return octaneUseState(initial, nextCompatHookSlot());
}

export function useReducer<S, A, I = S>(
	reducer: (state: S, action: A) => S,
	initialArg: I,
	init?: (arg: I) => S,
) {
	const slot = nextCompatHookSlot();
	return init === undefined
		? octaneUseReducer(reducer, initialArg, slot)
		: octaneUseReducer(reducer, initialArg, init, slot);
}

export function useEffect(fn: () => void | (() => void), deps?: any[]): void {
	octaneUseEffect(fn, deps, nextCompatHookSlot());
}

export function useLayoutEffect(fn: () => void | (() => void), deps?: any[]): void {
	octaneUseLayoutEffect(fn, deps, nextCompatHookSlot());
}

export function useInsertionEffect(fn: () => void | (() => void), deps?: any[]): void {
	octaneUseInsertionEffect(fn, deps, nextCompatHookSlot());
}

export function useMemo<T>(factory: () => T, deps?: any[]): T {
	return octaneUseMemo(factory, deps, nextCompatHookSlot());
}

export function useCallback<F extends (...args: any[]) => any>(fn: F, deps?: any[]): F {
	return octaneUseCallback(fn, deps, nextCompatHookSlot());
}

export function useRef<T>(initial: T): { current: T };
export function useRef<T>(initial: T | null): { current: T | null };
export function useRef<T>(initial: T): { current: T } {
	return octaneUseRef(initial, nextCompatHookSlot());
}

export function useId(): string {
	return octaneUseId(nextCompatHookSlot());
}

export function useImperativeHandle<T>(
	ref: { current: T | null } | ((value: T | null) => void) | null | undefined,
	factory: () => T,
	deps?: any[],
): void {
	octaneUseImperativeHandle(ref, factory, deps, nextCompatHookSlot());
}

export function useEffectEvent<F extends (...args: any[]) => any>(fn: F): F {
	return octaneUseEffectEvent(fn, nextCompatHookSlot());
}

export function useSyncExternalStore<T>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => T,
	getServerSnapshot?: () => T,
): T {
	const slot = nextCompatHookSlot();
	return getServerSnapshot === undefined
		? octaneUseSyncExternalStore(subscribe, getSnapshot, slot)
		: octaneUseSyncExternalStore(subscribe, getSnapshot, getServerSnapshot, slot);
}

export function useDeferredValue<T>(value: T, initialValue?: T): T {
	const slot = nextCompatHookSlot();
	return arguments.length >= 2
		? octaneUseDeferredValue(value, initialValue, slot)
		: octaneUseDeferredValue(value, slot);
}

export function useTransition() {
	return octaneUseTransition(nextCompatHookSlot());
}

export function useActionState<S>(
	action: (previousState: S, payload: any) => S | Promise<S>,
	initialState: S,
	permalink?: string,
) {
	const slot = nextCompatHookSlot();
	return permalink === undefined
		? octaneUseActionState(action, initialState, slot)
		: octaneUseActionState(action, initialState, permalink, slot);
}

export function useFormStatus(): FormStatus {
	return octaneUseFormStatus(nextCompatHookSlot());
}

export function useOptimistic<S, V = S>(state: S, updateFn?: (state: S, value: V) => S) {
	const slot = nextCompatHookSlot();
	return updateFn === undefined
		? octaneUseOptimistic<S, V>(state, slot)
		: octaneUseOptimistic(state, updateFn, slot);
}

export const use = octaneUse;

export function useDebugValue(_value?: unknown, _format?: (value: unknown) => unknown): void {}

export function createRef<T>(): { current: T | null } {
	return { current: null };
}

export function createContext<T>(defaultValue: T): Context<T> & {
	Consumer: (props: { children: (value: T) => unknown }) => unknown;
} {
	const context = octaneCreateContext(defaultValue) as Context<T> & {
		Consumer: (props: { children: (value: T) => unknown }) => unknown;
	};
	(context.Provider as any)[MANAGED_COMPONENT] = true;
	context.Consumer = function Consumer(props) {
		return props.children(useContext(context));
	};
	return context;
}

export function Fragment(props: { children?: unknown }): unknown {
	return props.children ?? null;
}

export function memo<P>(component: (props: P) => unknown, compare?: (a: P, b: P) => boolean) {
	const wrapped = octaneMemo(resolveCompatType(component) as any, compare as any) as any;
	wrapped[MANAGED_COMPONENT] = true;
	return wrapped;
}

export function forwardRef<T, P extends object>(
	render: (props: P, ref: T | null) => unknown,
): (props: P & { ref?: T | null }) => unknown {
	const Wrapped = (props: P & { ref?: T | null }) => render(props, props.ref ?? null);
	Wrapped.displayName =
		(render as { displayName?: string; name?: string }).displayName ?? render.name;
	return Wrapped;
}

export function StrictMode(props: { children?: unknown }): unknown {
	return props.children ?? null;
}

export function Profiler(props: { children?: unknown }): unknown {
	return props.children ?? null;
}

export function lazy<T extends (props: any) => unknown>(
	load: () => Promise<{ default: T }>,
): (props: Parameters<T>[0]) => unknown {
	let request: Promise<{ default: T }> | undefined;
	return function Lazy(props: Parameters<T>[0]) {
		const module = use((request ??= load()));
		return createElement(module.default as never, props as never);
	};
}

type StateUpdate<S> = Partial<S> | S | null | ((state: S, props: any) => Partial<S> | S | null);

interface CompatClassInstance<P = any, S = any> {
	props: P;
	state: S;
	context: any;
	render(): unknown;
	componentDidMount?(): void;
	componentDidUpdate?(prevProps: P, prevState: S): void;
	componentWillUnmount?(): void;
	componentDidCatch?(error: unknown, info: { componentStack: string }): void;
	__compatUpdate?: (
		update: StateUpdate<S> | undefined,
		callback?: () => void,
		force?: boolean,
	) => void;
	__compatPrevState?: S;
	__compatCallbacks?: Array<() => void>;
	__compatErrorReset?: (() => void) | null;
	__compatHandlingError?: boolean;
	__compatCaughtError?: unknown;
}

/**
 * React class base used by the compatibility adapter. The adapter supports the
 * common state/lifecycle subset and class Error Boundaries; legacy pre-render
 * lifecycles and getSnapshotBeforeUpdate fail explicitly.
 */
export class Component<P = any, S = any> {
	props: P;
	state!: S;
	context: any;
	refs: Record<string, unknown> = {};
	__compatUpdate?: CompatClassInstance<P, S>['__compatUpdate'];
	constructor(props: P, context?: any) {
		this.props = props;
		this.context = context;
	}
	setState(update: StateUpdate<S>, callback?: () => void): void {
		if (this.__compatUpdate) {
			this.__compatUpdate(update, callback, false);
			return;
		}
		const partial =
			typeof update === 'function'
				? (update as (state: S, props: P) => Partial<S> | S | null)(this.state, this.props)
				: update;
		if (partial != null) {
			this.state =
				typeof this.state === 'object' && this.state !== null && typeof partial === 'object'
					? ({ ...this.state, ...partial } as S)
					: (partial as S);
		}
		callback?.();
	}
	forceUpdate(callback?: () => void): void {
		if (!this.__compatUpdate) {
			callback?.();
			return;
		}
		this.__compatUpdate(undefined, callback, true);
	}
}
export class PureComponent<P = any, S = any> extends Component<P, S> {}

type ClassType = (new (props: any, context?: any) => CompatClassInstance) & {
	displayName?: string;
	defaultProps?: Record<string, unknown>;
	contextType?: Context<any>;
	getDerivedStateFromProps?: (props: any, state: any) => any;
	getDerivedStateFromError?: (error: unknown) => any;
};

const CLASS_ADAPTERS = new WeakMap<Function, (props: any) => unknown>();
const UNSUPPORTED_CLASS_LIFECYCLES = [
	'getSnapshotBeforeUpdate',
	'componentWillMount',
	'componentWillReceiveProps',
	'componentWillUpdate',
	'UNSAFE_componentWillMount',
	'UNSAFE_componentWillReceiveProps',
	'UNSAFE_componentWillUpdate',
] as const;

function mergeClassState(instance: CompatClassInstance, partial: any): void {
	if (partial == null) return;
	instance.state =
		typeof instance.state === 'object' && instance.state !== null && typeof partial === 'object'
			? { ...instance.state, ...partial }
			: partial;
}

function assertSupportedClass(instance: CompatClassInstance, Type: ClassType): void {
	for (const name of UNSUPPORTED_CLASS_LIFECYCLES) {
		if (typeof (instance as any)[name] === 'function') {
			throw new Error(
				`[react-compat] ${Type.displayName ?? Type.name ?? 'ClassComponent'}.${name} is not supported. ` +
					'Port this lifecycle to hooks or an Octane-native entry.',
			);
		}
	}
}

function makeClassAdapter(Type: ClassType): (props: any) => unknown {
	function ClassAdapter(allProps: any): unknown {
		const props = allProps?.ref === undefined ? allProps : { ...allProps, ref: undefined };
		const instanceRef = useRef<CompatClassInstance | null>(null);
		const [, forceRender] = useReducer((value: number) => value + 1, 0);
		const firstCommit = useRef(true);
		const callbacks = useRef<Array<() => void>>([]);
		let instance = instanceRef.current;
		if (instance === null) {
			instance = new Type(props, undefined);
			instanceRef.current = instance;
			instance.__compatCallbacks = callbacks.current;
			assertSupportedClass(instance, Type);
		}

		const previousProps = instance.props;
		const previousState = instance.__compatPrevState ?? instance.state;
		instance.props = props;
		if (Type.contextType) instance.context = useContext(Type.contextType);
		const derived = Type.getDerivedStateFromProps?.(props, instance.state);
		mergeClassState(instance, derived);

		instance.__compatUpdate = (update, callback, force) => {
			const before = instance!.state;
			if (!force) {
				const partial =
					typeof update === 'function' ? update(instance!.state, instance!.props) : update;
				mergeClassState(instance!, partial);
			}
			instance!.__compatPrevState ??= before;
			if (callback) instance!.__compatCallbacks!.push(callback);
			forceRender(undefined as never);
			if (instance!.__compatErrorReset && !instance!.__compatHandlingError) {
				const reset = instance!.__compatErrorReset;
				instance!.__compatErrorReset = null;
				queueMicrotask(reset);
			}
		};

		useImperativeHandle(allProps?.ref, () => instance!, [instance]);
		useLayoutEffect(() => {
			if (firstCommit.current) {
				firstCommit.current = false;
				instance!.componentDidMount?.();
			} else {
				instance!.componentDidUpdate?.(previousProps, previousState);
			}
			instance!.__compatPrevState = undefined;
			const pending = instance!.__compatCallbacks!;
			while (pending.length > 0) pending.shift()!();
		});
		useLayoutEffect(() => () => instance!.componentWillUnmount?.(), []);

		// Render the class itself OUTSIDE its boundary: like React, a boundary
		// catches descendants, never errors thrown by its own render method.
		const output = instance.render();
		const isBoundary =
			typeof Type.getDerivedStateFromError === 'function' ||
			typeof instance.componentDidCatch === 'function';
		if (!isBoundary) return output;

		return octaneCreateElement(ErrorBoundary, {
			children: output,
			fallback: (error: unknown, reset: () => void) => {
				instance!.__compatErrorReset = reset;
				if (instance!.__compatCaughtError !== error) {
					instance!.__compatCaughtError = error;
					instance!.__compatHandlingError = true;
					try {
						mergeClassState(instance!, Type.getDerivedStateFromError?.(error));
						instance!.componentDidCatch?.(error, { componentStack: '' });
					} finally {
						instance!.__compatHandlingError = false;
					}
				}
				return instance!.render();
			},
		} as any);
	}
	ClassAdapter.displayName = `ReactCompat(${Type.displayName ?? Type.name ?? 'Class'})`;
	return ClassAdapter;
}

function managedFunction(type: (props: any) => unknown): (props: any) => unknown {
	let adapter = FUNCTION_ADAPTERS.get(type);
	if (adapter) return adapter;
	adapter = function CompatFunction(props: any) {
		beginCompatHookRender();
		const output = type(props);
		finishCompatHookRender();
		return output;
	};
	(adapter as any).displayName = (type as any).displayName ?? type.name;
	(adapter as any)[MANAGED_COMPONENT] = true;
	FUNCTION_ADAPTERS.set(type, adapter);
	return adapter;
}

export function resolveCompatType(type: any): any {
	if (type?.$$kind === CONTEXT_TAG) return type.Provider;
	if (
		type === Activity ||
		type === ErrorBoundary ||
		type === Suspense ||
		type?.[MANAGED_COMPONENT] === true ||
		typeof type !== 'function'
	) {
		return type;
	}
	if (typeof type.prototype?.render === 'function') {
		let adapter = CLASS_ADAPTERS.get(type);
		if (!adapter) {
			adapter = managedFunction(makeClassAdapter(type as ClassType));
			CLASS_ADAPTERS.set(type, adapter);
		}
		return adapter;
	}
	return managedFunction(type);
}

export function createElement(type: any, props?: any, ...children: any[]): unknown {
	let nextProps = typeof type === 'string' ? compatHostProps(type, props) : props;
	if (typeof type?.prototype?.render === 'function' && type.defaultProps != null) {
		nextProps = { ...(nextProps ?? {}) };
		for (const name in type.defaultProps) {
			if (nextProps[name] === undefined) nextProps[name] = type.defaultProps[name];
		}
	}
	return octaneCreateElement(resolveCompatType(type), nextProps, ...children);
}

export const isValidElementType = (type: unknown): boolean =>
	type === Fragment || typeof type === 'string' || typeof type === 'function';

const React = {
	version,
	octaneCompatibility,
	Activity,
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
	useId,
	useFormStatus,
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
};

export default React;
