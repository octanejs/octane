import { identity, Observable, Subject } from 'rxjs';

/**
 * Creates a signal. It's sugar for splitting the Observer and the Observable of a signal.
 *
 * @param mapper a mapper function, for mapping the arguments of the emitter function into
 * the value of the Observable.
 * @returns [1, 2]
 * 1. The Observable<T>
 * 2. The emitter function.
 */
export function createSignal<A extends unknown[], T>(
	mapper: (...args: A) => T,
): [Observable<T>, (...args: A) => void];

/**
 * Creates a void signal. It's sugar for splitting the Observer and the Observable of a signal.
 *
 * @returns [1, 2]
 * 1. The Observable<void>
 * 2. The emitter function.
 */
export function createSignal(): [Observable<void>, () => void];

/**
 * Creates a signal. It's sugar for splitting the Observer and the Observable of a signal.
 *
 * @returns [1, 2]
 * 1. The Observable<T>
 * 2. The emitter function.
 */
export function createSignal<T>(): [Observable<T>, (payload: T) => void];

export function createSignal<A extends unknown[], T>(
	mapper: (...args: A) => T = identity as any,
): [Observable<T>, (...args: A) => void] {
	const subject = new Subject<T>();
	return [subject.asObservable(), (...args: A) => subject.next(mapper(...args))];
}
