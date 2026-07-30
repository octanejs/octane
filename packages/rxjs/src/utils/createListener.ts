import { Observable } from 'rxjs';
import { createSignal } from './createSignal';

/** @deprecated createListener is deprecated and it will be removed in the next version, please use createSignal. */
export function createListener<A extends unknown[], T>(
	mapper: (...args: A) => T,
): [Observable<T>, (...args: A) => void];

/** @deprecated createListener is deprecated and it will be removed in the next version, please use createSignal. */
export function createListener(): [Observable<void>, () => void];

/** @deprecated createListener is deprecated and it will be removed in the next version, please use createSignal. */
export function createListener<T>(): [Observable<T>, (payload: T) => void];

/**
 * Creates a void signal. It's sugar for splitting the Observer and the Observable of a signal.
 *
 * @returns [1, 2]
 * 1. The Observable
 * 2. The emitter function.
 */
export function createListener(...args: any[]) {
	return (createSignal as any)(...args);
}
