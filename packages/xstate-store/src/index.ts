// Ported from @xstate/store-react@2.0.0 src/index.ts
// (statelyai/xstate @ ddca0ff8c53dc2e85f9173514cc686308d65bd2c).
//
// The framework-agnostic `@xstate/store` core is re-exported unchanged, exactly
// as upstream does, so `createStore`, `createAtom`, `fromStore`, `shallowEqual`
// and every type reach consumers from this entry point.
//
// Slot plumbing: this package declares `octane.hookSlots.manual` for `src`, so
// every hook below takes the caller's compiler-assigned slot as a trailing
// argument (split with `splitSlot`, since the user arguments are optional) and
// derives a distinct sub-slot per composed hook.
//
// Upstream calls hooks inside `if` branches in `useSelector` and `useAtom`.
// That is a rules-of-hooks violation React tolerates only because the branch is
// stable for a given call site. Octane keys hooks by call site rather than call
// order, so the shape is kept verbatim and is simply legal here; see UPSTREAM.md
// for the one behavioral consequence when a branch does flip.
// OCTANE DIVERGENCE[xstate-store-call-site-hook-slots][ordinary:xstate-store-hook-slot-per-call-site]
export * from '@xstate/store';

import { useCallback, useRef, useSyncExternalStore } from 'octane';
import {
	type AnyStoreConfig,
	type AnyStoreLogicCreator,
	type StoreFromStoreLogicCreator,
	type StoreFromStoreConfig,
	type InputFromStoreLogicCreator,
	type Readable,
	type AnyAtom,
	type AnyAtomConfig,
	type AtomConfig,
	type BaseAtom,
	type InputFromAtomConfig,
	type ValueFromAtomConfig,
	type StoreSnapshot,
	type ContextFromStoreConfig,
	createStore,
} from '@xstate/store';
import { splitSlot, subSlot } from './internal.ts';

function defaultCompare<T>(a: T | undefined, b: T) {
	return a === b;
}

function identity<T>(snapshot: T): T {
	return snapshot;
}

function useSelectorWithCompare<TSnapshot, T>(
	selector: (snapshot: TSnapshot) => T,
	compare: (a: T | undefined, b: T) => boolean,
	slot: symbol | undefined,
): (snapshot: TSnapshot) => T {
	const previous = useRef<T | undefined>(undefined, slot);

	return (snapshot) => {
		const next = selector(snapshot);
		return previous.current !== undefined && compare(previous.current, next)
			? previous.current
			: (previous.current = next);
	};
}

function createStoreFromDefinition<TDefinition extends AnyStoreConfig>(
	definition: TDefinition,
): StoreFromStoreConfig<TDefinition>;
function createStoreFromDefinition(definition: AnyStoreConfig) {
	return createStore(definition);
}

type StoreDefinition = AnyStoreConfig | AnyStoreLogicCreator;

type StoreFromStoreDefinition<TDefinition extends StoreDefinition> =
	TDefinition extends AnyStoreLogicCreator
		? StoreFromStoreLogicCreator<TDefinition>
		: TDefinition extends AnyStoreConfig
			? StoreFromStoreConfig<TDefinition>
			: never;

type UseStoreArgs<TDefinition extends StoreDefinition> = TDefinition extends AnyStoreLogicCreator
	? undefined extends InputFromStoreLogicCreator<TDefinition>
		? [logic: TDefinition, input?: InputFromStoreLogicCreator<TDefinition>]
		: [logic: TDefinition, input: InputFromStoreLogicCreator<TDefinition>]
	: [definition: TDefinition];

type AtomDefinition = BaseAtom<any> | AnyAtomConfig;

type AtomStateFromDefinition<TDefinition extends AtomDefinition> = TDefinition extends AnyAtomConfig
	? readonly [value: ValueFromAtomConfig<TDefinition>, atom: ReturnType<TDefinition['createAtom']>]
	: TDefinition extends BaseAtom<infer TValue>
		? readonly [value: TValue, atom: TDefinition]
		: never;

type UseAtomStateArgs<TDefinition extends AtomDefinition> = TDefinition extends AnyAtomConfig
	? undefined extends InputFromAtomConfig<TDefinition>
		? [config: TDefinition, input?: InputFromAtomConfig<TDefinition>]
		: [config: TDefinition, input: InputFromAtomConfig<TDefinition>]
	: [atom: TDefinition];

type AtomConfigInput<TInput> = undefined extends TInput ? [input?: TInput] : [input: TInput];

function isAtom(value: unknown): value is AnyAtom {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as any).get === 'function' &&
		typeof (value as any).subscribe === 'function'
	);
}

/**
 * An Octane hook that subscribes to the `store` and selects a value from the
 * store's snapshot via a selector function, with an optional compare function.
 *
 * @example
 *
 * ```ts
 * function Component() @{
 *   const count = useSelector(store, (s) => s.count);
 *
 *   <div>{count as string}</div>
 * }
 * ```
 *
 * @param store The store, created from `createStore(…)`
 * @param selector A function which takes in the `snapshot` and returns a
 *   selected value
 * @param compare An optional function which compares the selected value to the
 *   previous value
 * @returns The selected value
 */
export function useSelector<TSnapshot, T>(
	store: Readable<TSnapshot>,
	selector: (snapshot: TSnapshot) => T,
	compare?: (a: T | undefined, b: T) => boolean,
	slot?: symbol,
): T;
/**
 * An Octane hook that subscribes to the `store` and selects a value from the
 * store's snapshot via an optional selector function (identity by default),
 * with an optional compare function.
 *
 * @example
 *
 * ```ts
 * function Component() @{
 *   const countSnapshot = useSelector(store);
 *
 *   <div>{countSnapshot.context.count as string}</div>
 * }
 * ```
 *
 * @param store The store, created from `createStore(…)`
 * @param selector An optional function which takes in the `snapshot` and
 *   returns a selected value
 * @param compare An optional function which compares the selected value to the
 *   previous value
 * @returns The selected value
 */
export function useSelector<TSnapshot>(
	store: Readable<TSnapshot>,
	selector?: undefined,
	compare?: (a: TSnapshot | undefined, b: TSnapshot | undefined) => boolean,
	slot?: symbol,
): TSnapshot;
export function useSelector<TSnapshot, T>(
	store: Readable<TSnapshot>,
	...rest: [
		selector?: (snapshot: TSnapshot) => T,
		compare?: (a: T | undefined, b: T) => boolean,
		slot?: symbol,
	]
): T | TSnapshot {
	const [userArgs, slot] = splitSlot(rest as unknown[]);
	const selector = userArgs[0] as ((snapshot: TSnapshot) => T) | undefined;
	const compare =
		(userArgs[1] as ((a: T | undefined, b: T) => boolean) | undefined) ?? defaultCompare;

	const subscribe = useCallback(
		(handleStoreChange: () => void) => store.subscribe(handleStoreChange).unsubscribe,
		[store],
		subSlot(slot, 'selector:subscribe'),
	);

	if (!selector) {
		const selectorWithCompare = useSelectorWithCompare(
			identity,
			defaultCompare,
			subSlot(slot, 'selector:identity-compare'),
		);

		return useSyncExternalStore(
			subscribe,
			() => selectorWithCompare(store.get()),
			() => selectorWithCompare(store.get()),
			subSlot(slot, 'selector:identity-store'),
		);
	}

	const selectorWithCompare = useSelectorWithCompare(
		selector,
		compare,
		subSlot(slot, 'selector:compare'),
	);

	return useSyncExternalStore(
		subscribe,
		() => selectorWithCompare(store.get()),
		() => selectorWithCompare(store.get()),
		subSlot(slot, 'selector:store'),
	);
}

/**
 * Creates a stable store instance for the lifetime of an Octane component.
 *
 * The public signature is upstream's rest tuple verbatim, with NO trailing
 * `slot` element. Appending one turns the conditional `UseStoreArgs<TDefinition>`
 * into a variadic tuple with a trailing member, and because this hook has no
 * leading parameter to infer `TDefinition` from, TypeScript then falls back to
 * the constraint and every schema inference in upstream's type suite collapses.
 * Authored code never passes a slot — the compiler appends it after the program
 * is typechecked — so the argument only has to exist at runtime, which
 * `splitSlot` recovers below.
 */
export function useStore<TDefinition extends StoreDefinition>(
	...[definition, input]: UseStoreArgs<TDefinition>
): StoreFromStoreDefinition<TDefinition>;
export function useStore(...rest: unknown[]): unknown {
	const [userArgs, slot] = splitSlot(rest);
	const definition = userArgs[0] as StoreDefinition;
	const input = userArgs[1];

	const storeRef = useRef<any>(undefined, subSlot(slot, 'store:instance'));

	if (!storeRef.current) {
		storeRef.current =
			'createStore' in definition
				? (definition as AnyStoreLogicCreator).createStore(input as never)
				: createStoreFromDefinition(definition as AnyStoreConfig);
	}

	return storeRef.current;
}

/**
 * An Octane hook that subscribes to the `atom` and returns the current value of
 * the atom.
 *
 * @param atom The atom, created from `createAtom(…)`
 * @param selector An optional function which takes in the `snapshot` and
 *   returns a selected value
 * @param compare An optional function which compares the selected value to the
 *   previous value
 */
export function useAtom<T>(atom: BaseAtom<T>, slot?: symbol): T;
export function useAtom<TValue, TInput>(
	config: AtomConfig<TValue, TInput>,
	...rest: [...AtomConfigInput<TInput>, slot?: symbol]
): TValue;
export function useAtom<T, S>(
	atom: BaseAtom<T>,
	selector: (snapshot: T) => S,
	compare?: (a: S, b: S) => boolean,
	slot?: symbol,
): S;
export function useAtom(
	definition: AnyAtom | AtomConfig<any, any>,
	...rest: [selectorOrInput?: any, compare?: any, slot?: symbol]
) {
	const [userArgs, slot] = splitSlot(rest as unknown[]);
	// Upstream's implementation signature is untyped here (`selectorOrInput?: any`)
	// because the three overloads above give it three different meanings.
	const selectorOrInput = userArgs[0] as any;
	const compare = (userArgs[1] as any) ?? defaultCompare;

	const atomRef = useRef<any>(undefined, subSlot(slot, 'atom:instance'));

	if (isAtom(definition)) {
		return useSelector(
			definition,
			selectorOrInput ?? identity,
			compare,
			subSlot(slot, 'atom:existing'),
		);
	}

	if (!atomRef.current) {
		atomRef.current = definition.createAtom(selectorOrInput);
	}

	const state = useSelector(atomRef.current, identity, compare, subSlot(slot, 'atom:created'));

	return state;
}

/**
 * Creates or subscribes to an atom for the lifetime of an Octane component.
 *
 * Pass an existing atom to receive `[value, atom]`, or pass an atom config
 * created with `createAtomConfig(...)` to create a stable local atom.
 */
export function useAtomState<TDefinition extends AtomDefinition>(
	...[definition]: UseAtomStateArgs<TDefinition>
): AtomStateFromDefinition<TDefinition>;
// Declared as an overload for the same reason as `useStore` above: appending a
// trailing `slot` to the conditional rest tuple destroys `TDefinition`
// inference, and authored code never passes one.
export function useAtomState(...rest: unknown[]): unknown {
	const [userArgs, slot] = splitSlot(rest);
	const definition = userArgs[0] as AtomDefinition;
	const input = userArgs[1];

	const atomRef = useRef<any>(undefined, subSlot(slot, 'atom-state:instance'));

	if (!atomRef.current) {
		atomRef.current = isAtom(definition)
			? definition
			: (definition as AnyAtomConfig).createAtom(input as never);
	}

	const value = useAtom(atomRef.current, subSlot(slot, 'atom-state:value'));

	// The overload above carries the precise tuple type; the implementation
	// signature is deliberately untyped, so it returns the erased shape.
	return [value, atomRef.current];
}

/**
 * Creates a custom hook that returns the selected value and the store from a
 * store configuration object.
 *
 * @param definition The store configuration object
 * @returns A custom hook that returns [selectedValue, store]
 */
export function createStoreHook<TDefinition extends AnyStoreConfig>(definition: TDefinition) {
	type TStore = StoreFromStoreConfig<TDefinition>;
	type TSnapshot = StoreSnapshot<ContextFromStoreConfig<TDefinition>>;

	const store = createStoreFromDefinition(definition);

	function useStoreHook(slot?: symbol): [TSnapshot, TStore];
	function useStoreHook<T>(
		selector: (snapshot: TSnapshot) => T,
		compare?: (a: T | undefined, b: T) => boolean,
		slot?: symbol,
	): [T, TStore];
	// The implementation signature has to admit a bare trailing slot in the first
	// position, because `useStoreHook()` compiles to `useStoreHook(sym)`.
	function useStoreHook<T>(...rest: any[]): [T | TSnapshot, TStore] {
		const [userArgs, slot] = splitSlot(rest as unknown[]);
		const selector = userArgs[0] as ((snapshot: TSnapshot) => T) | undefined;
		const compare =
			(userArgs[1] as ((a: T | undefined, b: T) => boolean) | undefined) ?? defaultCompare;

		if (!selector) {
			const snapshot = useSelector(
				store as unknown as Readable<TSnapshot>,
				undefined,
				undefined,
				subSlot(slot, 'store-hook:snapshot'),
			);
			return [snapshot, store];
		}

		const selectedValue = useSelector(
			store as unknown as Readable<TSnapshot>,
			selector,
			compare,
			subSlot(slot, 'store-hook:selected'),
		);
		return [selectedValue, store];
	}

	return useStoreHook;
}
