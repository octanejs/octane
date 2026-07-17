import * as Octane from 'octane';
import { flushUniversalAct, flushUniversalSync, type UniversalSyncFlusher } from 'octane/universal';

export type Act = typeof import('octane').act;
type FlushSync = typeof import('octane').flushSync;
const NO_ACT_ERROR = Symbol('octane.three.no-act-error');

function isThenable<T>(value: T | Promise<T>): value is Promise<T> {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as PromiseLike<T>).then === 'function'
	);
}

function runActCallback<T>(
	callback: () => T | Promise<T>,
	flushOwner?: UniversalSyncFlusher,
): T | Promise<T> {
	const result = flushUniversalAct(callback, flushOwner);
	if (!isThenable(result)) return result;
	return Promise.resolve(result).then((value) => flushUniversalAct(() => value, flushOwner));
}

function runClientAct<T>(callback: () => T | Promise<T>, clientAct: Act): Promise<T> {
	const completions: Promise<unknown>[] = [];
	const flushOwner: UniversalSyncFlusher = <Value>(run: () => Value): Value => {
		let value!: Value;
		let error: unknown = NO_ACT_ERROR;
		const completion = clientAct(() => {
			try {
				value = run();
			} catch (caught) {
				error = caught;
			}
		});
		completions.push(completion);
		if (error !== NO_ACT_ERROR) throw error;
		return value;
	};

	let result: T | Promise<T>;
	try {
		// Each universal wave executes inside a full DOM act phase, including DOM
		// passive effects. This closes DOMRegion cascades in both directions.
		result = flushUniversalAct(callback, flushOwner);
	} catch (error) {
		return Promise.allSettled(completions.splice(0)).then(() => {
			throw error;
		});
	}

	return (async () => {
		try {
			const value = await result;
			await Promise.all(completions.splice(0));
			const settled = flushUniversalAct(() => value, flushOwner);
			await Promise.all(completions.splice(0));
			return settled;
		} catch (error) {
			await Promise.allSettled(completions.splice(0));
			throw error;
		}
	})();
}

/** Flushes both the DOM scheduler and mounted universal Three roots. */
export const flushSync: FlushSync = (callback) => {
	const clientFlushSync = Reflect.get(Octane, 'flushSync') as FlushSync | undefined;
	return flushUniversalSync(callback, clientFlushSync);
};

/** R3F-compatible test helper backed by Octane's client scheduler when available. */
export const act: Act = (callback) => {
	const clientAct = Reflect.get(Octane, 'act') as Act | undefined;
	const clientFlushSync = Reflect.get(Octane, 'flushSync') as FlushSync | undefined;
	if (typeof clientAct === 'function') return runClientAct(callback, clientAct);
	try {
		return Promise.resolve(runActCallback(callback, clientFlushSync));
	} catch (error) {
		return Promise.reject(error);
	}
};
