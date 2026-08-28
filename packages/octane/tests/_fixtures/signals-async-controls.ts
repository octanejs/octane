import { setImmediate } from 'node:timers';
import type { SignalHandle, SignalSnapshot } from 'octane/signals';

export interface Deferred<T> {
	readonly promise: Promise<T>;
	resolve(value: T | PromiseLike<T>): void;
	reject(error: unknown): void;
}

export function deferred<T>(): Deferred<T> {
	let resolve!: Deferred<T>['resolve'];
	let reject!: Deferred<T>['reject'];
	const promise = new Promise<T>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	return { promise, resolve, reject };
}

export function nextSnapshot$<T>(
	handle$: SignalHandle<T>,
	accept: (snapshot: SignalSnapshot<T>) => boolean,
): Promise<SignalSnapshot<T>> {
	return new Promise((resolve) => {
		let stop = () => {};
		const check = () => {
			const snapshot = handle$.snapshot();
			if (accept(snapshot)) {
				stop();
				resolve(snapshot);
			}
		};
		stop = handle$.subscribe(check);
		check();
	});
}

export function capturePending$(read: () => unknown): PromiseLike<unknown> {
	try {
		read();
	} catch (error) {
		if (error && typeof (error as PromiseLike<unknown>).then === 'function') {
			return error as PromiseLike<unknown>;
		}
		throw error;
	}
	throw new Error('Expected the public read to suspend.');
}

/** Drain queued producer reactions at a host-turn boundary, without a timed sleep. */
export function drainProducers(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

type StreamEvent<T> =
	| { readonly kind: 'value'; readonly value: T }
	| { readonly kind: 'end' }
	| { readonly kind: 'error'; readonly error: unknown };

export function controlledStream<T>(options?: { onNext?: () => void; onReturn?: () => unknown }) {
	const started = deferred<void>();
	const cancelled = deferred<void>();
	const events: StreamEvent<T>[] = [];
	let waiting: Deferred<IteratorResult<T>> | undefined;
	let cancellations = 0;
	let nextCalls = 0;
	const deliver = (step: Deferred<IteratorResult<T>>, event: StreamEvent<T>) => {
		if (event.kind === 'error') step.reject(event.error);
		else if (event.kind === 'end') step.resolve({ done: true, value: undefined });
		else step.resolve({ done: false, value: event.value });
	};
	const push = (event: StreamEvent<T>) => {
		if (waiting) {
			const step = waiting;
			waiting = undefined;
			deliver(step, event);
		} else events.push(event);
	};
	const iterable: AsyncIterable<T> = {
		[Symbol.asyncIterator]() {
			return {
				next() {
					nextCalls++;
					started.resolve();
					options?.onNext?.();
					if (waiting) throw new Error('The test producer received concurrent next calls.');
					const step = deferred<IteratorResult<T>>();
					const event = events.shift();
					if (event) deliver(step, event);
					else waiting = step;
					return step.promise;
				},
				return() {
					cancellations++;
					cancelled.resolve();
					const result = options?.onReturn?.();
					return Promise.resolve(result).then(() => ({ done: true as const, value: undefined }));
				},
			};
		},
	};
	return {
		iterable,
		started: started.promise,
		cancelled: cancelled.promise,
		get cancellations() {
			return cancellations;
		},
		get nextCalls() {
			return nextCalls;
		},
		emit(value: T) {
			push({ kind: 'value', value });
		},
		end() {
			push({ kind: 'end' });
		},
		fail(error: unknown) {
			push({ kind: 'error', error });
		},
	};
}
