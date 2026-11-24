/** Compiler slots are numeric ranges; explicitly authored slots may be symbols. */
export type ValdiHookSlot = number | symbol;

type Setter<T> = (next: T | ((previous: T) => T)) => void;
// The compiler selects __useStateWithGetter when a third member can be observed.
// Adapters may return more than the minimum pair without allocating a getter
// for every base call.
type State<T> = [T, Setter<T>, ...unknown[]];
type StateWithGetter<T> = [T, Setter<T>, () => T];
type Dependencies = readonly unknown[] | null;
// Match the authored hook's NoInfer return type in adapters built with TypeScript 5.3.
type InitialValue<T> = [T][T extends unknown ? 0 : never];

/**
 * Stable facade consumed by the Valdi writer compiler. Prototype, constructor,
 * and key representations belong to the adapter, not to Octane.
 * Methods retain their receiver. These calls operate on the current writer
 * scope; they do not independently type-check a component's complete props.
 */
export interface ValdiWriter<Prototype = unknown, Constructor = unknown, Key = unknown> {
	/** Flat [name, value, ...] pairs. */
	makeNodePrototype(tag: string, staticPairs?: readonly unknown[]): Prototype;
	makeComponentPrototype(staticPairs?: readonly unknown[]): Prototype;
	beginRender(prototype: Prototype, key: Key | undefined): void;
	endRender(): void;
	setAttribute(name: string, value: unknown): void;
	setAttributeBool(name: string, value: boolean | null | undefined): void;
	setAttributeNumber(name: string, value: number | null | undefined): void;
	setAttributeString(name: string, value: string | null | undefined): void;
	setAttributeFunction(name: string, value: Function | null | undefined): void;
	setAttributeStyle(name: string, value: unknown): void;
	beginComponent(constructor: Constructor, prototype: Prototype, key: Key | undefined): void;
	endComponent(): void;
	setViewModelProperty(name: string, value: unknown): void;
	/** Replace the full prop set, clearing properties absent from this object. */
	setViewModelFull(props: object): void;
	/** ABI 2: required for text: 'host' without host-text-site. Validate dynamic values. */
	appendText?(value: unknown): void;
	/** ABI 3: required for host-text-site. Values may include arrays; validate at runtime. */
	renderText?(prototype: Prototype, value: unknown, key: Key | undefined): void;
}

/**
 * Type contract for an application-provided Valdi adapter module, not a runtime
 * implementation. Import this with `import type`. Supported exports are required
 * when the compiler emits them; adapters may implement a subset for restricted
 * source, or use Pick<ValdiAdapter, ...> to type an individual layer.
 *
 * Components in this typed lane retain the render function's callable API.
 * Registration must preserve its props, generic parameters, and overloads.
 * The compiler consumes registered components through getValdiComponentConstructor;
 * it does not inspect their runtime representation.
 */
export interface ValdiAdapter<Prototype = unknown, Constructor = unknown, Key = unknown> {
	/** Reject unsupported versions before creating prototypes or registering components. */
	assertValdiCompilerAbi(version: number): void;
	readonly jsx: ValdiWriter<Prototype, Constructor, Key>;
	defineValdiComponent<F extends (...args: any[]) => void>(
		render: F,
		options: { hasHooks: boolean },
	): F;
	getValdiComponentConstructor(component: (...args: any[]) => void): Constructor;
	/** Preserve part order, type, and boundaries; prototypes remain opaque. */
	valdiKey(prototype: Prototype, ...parts: unknown[]): Key;
	/** Apply the full host attribute set and clear attributes that disappeared. */
	setValdiAttributes(props: object): void;
	/** Reserve a disjoint range of count numeric slots for this module. */
	hookSlots(count: number): number;
	/** Run with the supplied slot path, forwarding arguments and result unchanged. */
	// Preserve an initialized hook's result through tuple-spread lowering instead
	// of inferring only its last, omitted-initializer overload.
	withSlot<A extends unknown[], R>(
		slot: ValdiHookSlot,
		callback: {
			(...args: A): R;
			(initial?: undefined, slot?: ValdiHookSlot): unknown;
		},
		...args: A
	): R;
	withSlot<A extends unknown[], R>(slot: ValdiHookSlot, callback: (...args: A) => R, ...args: A): R;
	// A slot can be omitted inside withSlot. The compiler pads omitted initial
	// values with undefined before appending the slot; retain that undefined.
	useState<T>(initial: T | (() => T), slot?: ValdiHookSlot): State<T>;
	useState<T = undefined>(initial?: undefined, slot?: ValdiHookSlot): State<T | undefined>;
	__useStateWithGetter<T>(initial: T | (() => T), slot?: ValdiHookSlot): StateWithGetter<T>;
	__useStateWithGetter<T = undefined>(
		initial?: undefined,
		slot?: ValdiHookSlot,
	): StateWithGetter<T | undefined>;
	/** Inferred callbacks can receive the dependency values as positional arguments. */
	useMemo<T>(calculate: (...args: any[]) => T, deps?: Dependencies, slot?: ValdiHookSlot): T;
	useCallback<F extends (...args: any[]) => any>(
		callback: F,
		deps?: Dependencies,
		slot?: ValdiHookSlot,
	): F;
	useLayoutEffect(
		create: (...args: any[]) => void | (() => void),
		deps?: Dependencies,
		slot?: ValdiHookSlot,
	): void;
	useRef<T>(initial: T, slot?: ValdiHookSlot): { current: T };
	useRef<T = undefined>(initial?: undefined, slot?: ValdiHookSlot): { current: T | undefined };
	/** Dependency identity may be a receiver, member value, or nullish sentinel. */
	__methodDep(receiver: unknown, name: string, guarded?: boolean, read?: boolean): unknown;
}

/** A child accepted by an adapter that implements the component-runtime capability. */
export type ValdiChild<Element = object> =
	Element | string | number | boolean | null | undefined | readonly ValdiChild<Element>[];

/** A registered component descriptor. Its return representation belongs to the adapter. */
export type ValdiComponent<Props = object, Element = object> = (props: Props) => Element;

type MemoComponent<C> = C & { readonly type: C; displayName?: string };

export interface ValdiContext<Value, Element = object> extends ValdiComponent<
	{ value: Value; children?: ValdiChild<Element> },
	Element
> {
	readonly defaultValue: Value;
}

export type {
	LayoutSnapshotOptions,
	LayoutSnapshotOptionsWithInitial,
} from '../layout-snapshot-types.js';
import type {
	LayoutSnapshotOptions,
	LayoutSnapshotOptionsWithInitial,
} from '../layout-snapshot-types.js';

export interface LinkedStatePrevious<Source, Value> {
	source: Source;
	value: Value;
}
export interface LinkedStateOptions<Source, Value> {
	sourceEqual?: (previous: Source, next: Source) => boolean;
	valueEqual?: (previous: Value, next: Value) => boolean;
}

/**
 * ABI 4 extension for an adapter that opts into `component-runtime`. Keeping it
 * separate leaves adapters for ABI 1–3 valid without implementing these exports.
 */
export interface ValdiComponentRuntimeAdapter<
	Prototype = unknown,
	Constructor = unknown,
	Key = unknown,
	Element = object,
> extends Omit<
	ValdiAdapter<Prototype, Constructor, Key>,
	'defineValdiComponent' | 'getValdiComponentConstructor'
> {
	defineValdiComponent<Props>(
		render: (props: Props) => void,
		options: { hasHooks: boolean },
	): ValdiComponent<Props, Element>;
	getValdiComponentConstructor(component: ValdiComponent<any, Element>): Constructor;
	memo?<C extends ValdiComponent<any, Element>>(
		component: C,
		arePropsEqual?: (
			previous: Readonly<Parameters<C>[0]>,
			next: Readonly<Parameters<C>[0]>,
		) => boolean,
	): MemoComponent<C>;
	memo?<Props>(
		component: ValdiComponent<Props, Element>,
		arePropsEqual?: (previous: Readonly<Props>, next: Readonly<Props>) => boolean,
	): MemoComponent<ValdiComponent<Props, Element>>;
	createValdiChildren(render: () => void): Element;
	createContext<Value>(defaultValue: Value): ValdiContext<Value, Element>;
	useContext<Value>(context: ValdiContext<Value, Element>): Value;
	useSyncExternalStore<Value>(
		subscribe: (notify: () => void) => () => void,
		getSnapshot: () => Value,
		getServerSnapshot?: (() => Value) | symbol,
		slot?: ValdiHookSlot,
	): Value;
	useEffect(
		create: (...args: any[]) => void | (() => void),
		deps?: Dependencies | symbol,
		slot?: ValdiHookSlot,
	): void;
	useEffectEvent<F extends (...args: any[]) => any>(callback: F, slot?: ValdiHookSlot): F;
	useLinkedState<Source, Value extends Previous, Previous = Value>(
		source: Source,
		reconcile: (
			source: Source,
			previous: LinkedStatePrevious<Source, Previous> | undefined,
		) => Value,
		options?: LinkedStateOptions<Source, Previous> | symbol,
		slot?: ValdiHookSlot,
	): State<unknown extends Previous ? Value : Previous>;
	__useLinkedStateWithGetter<Source, Value extends Previous, Previous = Value>(
		source: Source,
		reconcile: (
			source: Source,
			previous: LinkedStatePrevious<Source, Previous> | undefined,
		) => Value,
		options?: LinkedStateOptions<Source, Previous> | symbol,
		slot?: ValdiHookSlot,
	): StateWithGetter<unknown extends Previous ? Value : Previous>;
	useId(slot?: ValdiHookSlot): string;
	useInitialValue?<Value>(
		initial: Value | (() => Value),
		slot?: ValdiHookSlot,
	): InitialValue<Value>;
	useLazyRef<Value>(create: () => Value, slot?: ValdiHookSlot): { current: Value };
	useLayoutSnapshot<Value>(
		measure: () => Value,
		options: LayoutSnapshotOptionsWithInitial<Value>,
		slot?: ValdiHookSlot,
	): Value;
	useLayoutSnapshot<Value>(
		measure: () => Value,
		options?: LayoutSnapshotOptions<Value> | symbol,
		slot?: ValdiHookSlot,
	): Value | undefined;
	flushSync<Result>(callback: () => Result): Result;
	readonly ErrorBoundary: ValdiComponent<
		{
			children?: ValdiChild<Element>;
			fallback?: ValdiChild<Element> | ((error: unknown, reset: () => void) => ValdiChild<Element>);
			resetRef?: { current: (() => void) | null };
		},
		Element
	>;
	readonly Suspense: ValdiComponent<
		{ children?: ValdiChild<Element>; fallback?: ValdiChild<Element> },
		Element
	>;
	lazy<Props>(
		load: () => PromiseLike<
			ValdiComponent<Props, Element> | { default: ValdiComponent<Props, Element> }
		>,
	): ValdiComponent<Props, Element>;
}
