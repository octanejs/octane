// useAtomValue — port of jotai's react/useAtomValue.ts. Upstream reads the
// atom through a force-update reducer holding a `[value, store, atom]` tuple
// and subscribes in an effect (re-render on store notify; an unconditional
// post-subscribe rerender catches updates that raced between render and
// effect — so mounting renders twice, in React and here alike). The port keeps
// that shape exactly: octane's `useReducer` has React's semantics (lazy init;
// a no-op dispatch still renders once with children bailing), and a
// render-phase `rerender()` on store/atom swap mutates the reducer state
// synchronously and schedules a self-quiescing re-render while THIS render
// uses the locally-computed value.
//
// Async atom values suspend through octane's `use()` on a "continuable"
// promise: a wrapper whose identity is WeakMap-stable across atom
// recomputations (aborted fetches chain into it via the store's abort-handler
// registry). That stability is what lets octane's thenable replay see the SAME
// promise on every re-render until it settles — do not simplify it away.
import { use, useDebugValue, useEffect, useReducer } from 'octane';
import { INTERNAL_getBuildingBlocksRev3 as INTERNAL_getBuildingBlocks } from 'jotai/vanilla/internals';
import type { Atom, ExtractAtomValue } from 'jotai/vanilla';
import { useStore, type Store } from './store';
import { splitSlot, subSlot } from '../internal';

const isPromiseLike = (x: unknown): x is PromiseLike<unknown> =>
	typeof (x as PromiseLike<unknown>)?.then === 'function';

// Opt-in (`unstable_promiseStatus`) decoration of the suspended promise with
// React 19's `status`/`value`/`reason` convention. Upstream defaults this to
// "React.use is missing"; octane always has `use`, so it defaults to false.
const attachPromiseStatus = <T>(
	promise: PromiseLike<T> & {
		status?: 'pending' | 'fulfilled' | 'rejected';
		value?: T;
		reason?: unknown;
	},
) => {
	if (!promise.status) {
		promise.status = 'pending';
		promise.then(
			(v) => {
				promise.status = 'fulfilled';
				promise.value = v;
			},
			(e) => {
				promise.status = 'rejected';
				promise.reason = e;
			},
		);
	}
};

const continuablePromiseMap = new WeakMap<PromiseLike<unknown>, Promise<unknown>>();

const createContinuablePromise = <T>(
	store: Store,
	promise: PromiseLike<T>,
	getValue: () => PromiseLike<T> | T,
) => {
	const buildingBlocks = INTERNAL_getBuildingBlocks(store);
	const registerAbortHandler = buildingBlocks[26];
	let continuablePromise = continuablePromiseMap.get(promise);
	if (!continuablePromise) {
		continuablePromise = new Promise<T>((resolve, reject) => {
			let curr = promise;
			const onFulfilled = (me: PromiseLike<T>) => (v: T) => {
				if (curr === me) {
					resolve(v);
				}
			};
			const onRejected = (me: PromiseLike<T>) => (e: unknown) => {
				if (curr === me) {
					reject(e);
				}
			};
			const onAbort = () => {
				try {
					const nextValue = getValue();
					if (isPromiseLike(nextValue)) {
						continuablePromiseMap.set(nextValue, continuablePromise!);
						curr = nextValue;
						nextValue.then(onFulfilled(nextValue), onRejected(nextValue));
						registerAbortHandler(buildingBlocks, store, nextValue, onAbort);
					} else {
						resolve(nextValue);
					}
				} catch (e) {
					reject(e);
				}
			};
			promise.then(onFulfilled(promise), onRejected(promise));
			registerAbortHandler(buildingBlocks, store, promise, onAbort);
		});
		continuablePromiseMap.set(promise, continuablePromise);
	}
	return continuablePromise;
};

type Options = Parameters<typeof useStore>[0] & {
	/** @deprecated delay option is deprecated and will be removed in v3. https://github.com/pmndrs/jotai/pull/3264 */
	delay?: number;
	unstable_promiseStatus?: boolean;
};

export function useAtomValue<Value>(atom: Atom<Value>, options?: Options): Awaited<Value>;

export function useAtomValue<AtomType extends Atom<unknown>>(
	atom: AtomType,
	options?: Options,
): Awaited<ExtractAtomValue<AtomType>>;

export function useAtomValue<Value>(
	atom: Atom<Value>,
	...rest: [options?: Options, slot?: symbol]
) {
	const [user, slot] = splitSlot(rest);
	const options = user[0] as Options | undefined;
	const { delay, unstable_promiseStatus: promiseStatus = false } = options || {};
	const store = useStore(options);

	const [[valueFromReducer, storeFromReducer, atomFromReducer], rerender] = useReducer<
		readonly [Value, Store, Atom<Value>],
		void,
		undefined
	>(
		(prev) => {
			const nextValue = store.get(atom);
			if (Object.is(prev[0], nextValue) && prev[1] === store && prev[2] === atom) {
				return prev;
			}
			return [nextValue, store, atom];
		},
		undefined,
		() => [store.get(atom), store, atom],
		subSlot(slot, 'uav:r'),
	);

	let value = valueFromReducer;
	if (storeFromReducer !== store || atomFromReducer !== atom) {
		rerender();
		value = store.get(atom);
	}

	useEffect(
		() => {
			const unsub = store.sub(atom, () => {
				if (promiseStatus) {
					try {
						const value = store.get(atom);
						if (isPromiseLike(value)) {
							attachPromiseStatus(createContinuablePromise(store, value, () => store.get(atom)));
						}
					} catch {
						// ignore
					}
				}
				if (typeof delay === 'number') {
					if (process.env.NODE_ENV !== 'production') {
						console.warn(
							'[DEPRECATED] delay option is deprecated and will be removed in v3. https://github.com/pmndrs/jotai/pull/3264',
						);
					}
					// delay rerendering to wait a promise possibly to resolve
					setTimeout(rerender, delay);
					return;
				}
				rerender();
			});
			rerender();
			return unsub;
		},
		[store, atom, delay, promiseStatus],
		subSlot(slot, 'uav:e'),
	);

	useDebugValue(value);
	if (isPromiseLike(value)) {
		const promise = createContinuablePromise(store, value, () => store.get(atom));
		if (promiseStatus) {
			attachPromiseStatus(promise);
		}
		return use(promise);
	}
	return value as Awaited<Value>;
}
