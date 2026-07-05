// Ported from .base-ui/packages/utils/src/store/ReactStore.ts (v1.6.0), octane-adapted. A Store
// with controlled-state keys, non-reactive `context`, and named `selectors`. octane adaptations:
// every hook-bearing method threads an explicit slot (octane hooks are slot-keyed); the fiber
// "fastHooks" path is dropped for the plain `useStore`; React dev-warning/`useDebugValue` blocks
// are dropped (functional outcomes only). `useIsoLayoutEffect` → octane `useLayoutEffect`.
import { useLayoutEffect, useRef } from 'octane';
import { subSlot } from '../../internal';
import { useStableCallback } from '../useStableCallback';
import { NOOP } from '../noop';
import { Store } from './Store';
import { useStore } from './useStore';

type SelectorFunction<State> = (state: State, a1?: any, a2?: any, a3?: any) => any;

export class ReactStore<
	State extends object,
	Context = Record<string, never>,
	Selectors extends Record<string, SelectorFunction<State>> = Record<string, never>,
> extends Store<State> {
	readonly context: Context;

	private selectors: Selectors | undefined;

	constructor(state: State, context: Context = {} as Context, selectors?: Selectors) {
		super(state);
		this.context = context;
		this.selectors = selectors;
	}

	/** Sync a single external value into the store (in a layout effect). */
	useSyncedValue<Key extends keyof State>(
		key: Key,
		value: State[Key],
		slot: symbol | undefined,
	): void {
		const store = this;
		useLayoutEffect(
			() => {
				if (store.state[key] !== value) {
					store.set(key, value);
				}
			},
			[store, key, value],
			slot,
		);
	}

	/** Sync a single external value into the store; reset to `undefined` on unmount. */
	useSyncedValueWithCleanup<Key extends keyof State>(
		key: Key,
		value: State[Key],
		slot: symbol | undefined,
	): void {
		const store = this;
		useLayoutEffect(
			() => {
				if (store.state[key] !== value) {
					store.set(key, value);
				}
				return () => {
					store.set(key, undefined as State[Key]);
				};
			},
			[store, key, value],
			slot,
		);
	}

	/** Sync multiple external values into the store. */
	useSyncedValues(statePart: Partial<State>, slot: symbol | undefined): void {
		const store = this;
		const dependencies = Object.values(statePart);
		useLayoutEffect(
			() => {
				store.update(statePart);
			},
			[store, ...dependencies],
			slot,
		);
	}

	/** Register a controllable prop: when `controlled` is defined, the store key tracks it. */
	useControlledProp<Key extends keyof State>(
		key: Key,
		controlled: State[Key] | undefined,
		slot: symbol | undefined,
	): void {
		const store = this;
		const isControlled = controlled !== undefined;
		useLayoutEffect(
			() => {
				if (isControlled && !Object.is(store.state[key], controlled)) {
					store.setState({ ...store.state, [key]: controlled });
				}
			},
			[store, key, controlled, isControlled],
			slot,
		);
	}

	/** Non-hook: read a selector's current value synchronously. */
	select<Key extends keyof Selectors>(
		key: Key,
		a1?: unknown,
		a2?: unknown,
		a3?: unknown,
	): ReturnType<Selectors[Key]> {
		const selector = this.selectors![key];
		return selector(this.state, a1, a2, a3);
	}

	/** Subscribe to a selector's value (re-renders on change). */
	useState<Key extends keyof Selectors>(
		key: Key,
		slot: symbol | undefined,
		a1?: unknown,
		a2?: unknown,
		a3?: unknown,
	): ReturnType<Selectors[Key]> {
		return useStore(this, this.selectors![key] as any, slot, a1, a2, a3);
	}

	/** Wrap a callback with `useStableCallback` and assign it to `context[key]`. */
	useContextCallback<Key extends keyof Context>(
		key: Key,
		fn: ((...args: any[]) => any) | undefined,
		slot: symbol | undefined,
	): void {
		const stableFunction = useStableCallback(fn ?? (NOOP as (...args: any[]) => any), slot);
		(this.context as Record<any, any>)[key] = stableFunction;
	}

	/** A stable ref-callback setter for a state key (commonly passed as a `ref`). */
	useStateSetter<Key extends keyof State>(
		key: Key,
		slot: symbol | undefined,
	): (value: State[Key]) => void {
		const store = this;
		const ref = useRef<((v: State[Key]) => void) | undefined>(undefined, slot);
		if (ref.current === undefined) {
			ref.current = (value: State[Key]) => {
				store.set(key, value);
			};
		}
		return ref.current;
	}

	/** Non-hook: observe a selector; call `listener` when its value changes (fires once now). */
	observe(
		selector: keyof Selectors | ((state: State) => any),
		listener: (newValue: any, oldValue: any, store: this) => void,
	): () => void {
		const selectFn: (state: State) => any =
			typeof selector === 'function' ? selector : (this.selectors![selector] as any);

		let prevValue = selectFn(this.state);
		listener(prevValue, prevValue, this);

		return this.subscribe((nextState) => {
			const nextValue = selectFn(nextState);
			if (!Object.is(prevValue, nextValue)) {
				const oldValue = prevValue;
				prevValue = nextValue;
				listener(nextValue, oldValue, this);
			}
		});
	}
}
