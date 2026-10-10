/** Compiler slots are numeric ranges; explicitly authored slots may be symbols. */
export type ValdiHookSlot = number | symbol;

type Setter<T> = (next: T | ((previous: T) => T)) => void;
// The compiler selects __useStateWithGetter when a third member can be observed.
// Adapters may return more than the minimum pair without allocating a getter
// for every base call.
type State<T> = [T, Setter<T>, ...unknown[]];
type StateWithGetter<T> = [T, Setter<T>, () => T];
type Dependencies = readonly unknown[] | null;

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
