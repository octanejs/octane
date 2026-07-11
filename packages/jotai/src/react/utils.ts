// `@octanejs/jotai/react/utils` — port of jotai's react/utils/*.ts (the four
// binding-side utils; everything else in `jotai/utils` is vanilla and reused
// verbatim). Each hook derives stable sub-slots for the base hooks it
// composes, so multiple uses in one component stay independent.
import { useCallback, useMemo } from 'octane';
import { atom } from 'jotai/vanilla';
import type { Getter, PrimitiveAtom, Setter, WritableAtom } from 'jotai/vanilla';
import { RESET } from 'jotai/vanilla/utils';
import { useStore, type Store } from './store';
import { useSetAtom } from './useSetAtom';
import { useAtom } from './useAtom';
import { splitSlot, subSlot } from '../internal';

type SetAtomOptions = Parameters<typeof useSetAtom>[1];

// useResetAtom — port of react/utils/useResetAtom.ts.
export function useResetAtom<T>(
	anAtom: WritableAtom<unknown, [typeof RESET], T>,
	options?: SetAtomOptions,
): () => T;
export function useResetAtom<T>(
	anAtom: WritableAtom<unknown, [typeof RESET], T>,
	...rest: [options?: SetAtomOptions, slot?: symbol]
) {
	const [user, slot] = splitSlot(rest);
	const options = user[0] as SetAtomOptions;
	const setAtom = (useSetAtom as (a: unknown, o?: unknown, s?: symbol) => (v: unknown) => T)(
		anAtom,
		options,
		subSlot(slot, 'ura:set'),
	);
	const resetAtom = useCallback(() => setAtom(RESET), [setAtom], subSlot(slot, 'ura:cb'));
	return resetAtom;
}

type AtomOptions = Parameters<typeof useAtom>[1];

/**
 * @deprecated please use a recipe instead
 * https://github.com/pmndrs/jotai/pull/2467
 */
export function useReducerAtom<Value, Action>(
	anAtom: PrimitiveAtom<Value>,
	reducer: (v: Value, a?: Action) => Value,
	options?: AtomOptions,
): [Value, (action?: Action) => void];
/**
 * @deprecated please use a recipe instead
 * https://github.com/pmndrs/jotai/pull/2467
 */
export function useReducerAtom<Value, Action>(
	anAtom: PrimitiveAtom<Value>,
	reducer: (v: Value, a: Action) => Value,
	options?: AtomOptions,
): [Value, (action: Action) => void];
export function useReducerAtom<Value, Action>(
	anAtom: PrimitiveAtom<Value>,
	reducer: (v: Value, a: Action) => Value,
	...rest: [options?: AtomOptions, slot?: symbol]
) {
	const [user, slot] = splitSlot(rest);
	const options = user[0] as AtomOptions;
	if (process.env.NODE_ENV !== 'production') {
		console.warn(
			'[DEPRECATED] useReducerAtom is deprecated and will be removed in the future. Please create your own version using the recipe. https://github.com/pmndrs/jotai/pull/2467',
		);
	}
	const [state, setState] = (
		useAtom as (
			a: unknown,
			o?: unknown,
			s?: symbol,
		) => [Value, (update: (prev: Value) => Value) => void]
	)(anAtom, options, subSlot(slot, 'urda:a'));
	const dispatch = useCallback(
		(action: Action) => {
			setState((prev) => reducer(prev, action));
		},
		[setState, reducer],
		subSlot(slot, 'urda:cb'),
	);
	return [state, dispatch];
}

// useAtomCallback — port of react/utils/useAtomCallback.ts: an ephemeral
// write-only atom memoized per callback, exposed through useSetAtom.
export function useAtomCallback<Result, Args extends unknown[]>(
	callback: (get: Getter, set: Setter, ...arg: Args) => Result,
	options?: SetAtomOptions,
): (...args: Args) => Result;
export function useAtomCallback<Result, Args extends unknown[]>(
	callback: (get: Getter, set: Setter, ...arg: Args) => Result,
	...rest: [options?: SetAtomOptions, slot?: symbol]
) {
	const [user, slot] = splitSlot(rest);
	const options = user[0] as SetAtomOptions;
	const anAtom = useMemo(
		() => atom(null, (get, set, ...args: Args) => callback(get, set, ...args)),
		[callback],
		subSlot(slot, 'uac:m'),
	);
	return (useSetAtom as (a: unknown, o?: unknown, s?: symbol) => (...args: Args) => Result)(
		anAtom,
		options,
		subSlot(slot, 'uac:set'),
	);
}

type HydrateOptions = Parameters<typeof useStore>[0] & {
	dangerouslyForceHydrate?: boolean;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWritableAtom = WritableAtom<any, any[], any>;

type InferAtomTuples<T> = {
	[K in keyof T]: T[K] extends readonly [infer A, ...infer Rest]
		? A extends WritableAtom<unknown, infer Args, unknown>
			? Rest extends Args
				? readonly [A, ...Rest]
				: never
			: T[K]
		: never;
};

// For internal use only
// This can be changed without notice.
export type INTERNAL_InferAtomTuples<T> = InferAtomTuples<T>;

const hydratedMap: WeakMap<Store, WeakSet<AnyWritableAtom>> = new WeakMap();

// useHydrateAtoms — port of react/utils/useHydrateAtoms.ts. Writes each
// [atom, value] into the resolved store DURING render, once per (store, atom)
// unless dangerouslyForceHydrate. No slotted hooks — only the context read.
export function useHydrateAtoms<T extends (readonly [AnyWritableAtom, ...unknown[]])[]>(
	values: InferAtomTuples<T>,
	options?: HydrateOptions,
): void;
export function useHydrateAtoms<T extends Map<AnyWritableAtom, unknown>>(
	values: T,
	options?: HydrateOptions,
): void;
export function useHydrateAtoms<T extends Iterable<readonly [AnyWritableAtom, ...unknown[]]>>(
	values: InferAtomTuples<T>,
	options?: HydrateOptions,
): void;
export function useHydrateAtoms<T extends Iterable<readonly [AnyWritableAtom, ...unknown[]]>>(
	values: T,
	...rest: [options?: HydrateOptions, slot?: symbol]
) {
	const [user] = splitSlot(rest);
	const options = user[0] as HydrateOptions | undefined;
	const store = useStore(options);

	const hydratedSet = getHydratedSet(store);
	for (const [atom, ...args] of values) {
		if (!hydratedSet.has(atom) || options?.dangerouslyForceHydrate) {
			hydratedSet.add(atom);
			store.set(atom, ...args);
		}
	}
}

const getHydratedSet = (store: Store) => {
	let hydratedSet = hydratedMap.get(store);
	if (!hydratedSet) {
		hydratedSet = new WeakSet();
		hydratedMap.set(store, hydratedSet);
	}
	return hydratedSet;
};
