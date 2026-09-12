// Jotai 3 separates the concurrent raw subscription from Suspense unwrapping.
import { use } from 'octane';
import type { Atom, ExtractAtomValue } from 'jotai/vanilla';
import { isPromiseLike } from './continuablePromise';
import { useAtomValueRaw } from './useAtomValueRaw';
import { splitSlot, subSlot } from '../internal';

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

type Options = Parameters<typeof useAtomValueRaw>[1] & {
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
	const value = (useAtomValueRaw as <T>(a: Atom<T>, o?: Options, s?: symbol) => T)(
		atom,
		options,
		subSlot(slot, 'value:raw'),
	);
	if (isPromiseLike(value)) {
		// Octane always provides use(); upstream's React 18 fallback is unnecessary.
		if (options?.unstable_promiseStatus) attachPromiseStatus(value);
		return use(value);
	}
	return value as Awaited<Value>;
}
