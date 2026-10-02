import { formatClientError } from './error-codes.client.generated.js';
import { captureSignalOwner, currentSignalOwner } from './signals/owner-context.js';
import { __prepareBindingSources } from './dom-binding-styles.js';
import {
	forwardNativeTransitionConsumer,
	setNativeReadObserver,
	type NativeReadSource,
	type NativeTransitionPresentation,
} from './signals/read-protocol.js';
import {
	SIGNAL_HANDLE,
	SIGNAL_BINDING_READ,
	SIGNAL_BINDING_SUBSCRIBE,
	type SignalHandle,
} from './signals/types.js';

export interface BindingSignalConnection {
	/** Resolve and observe a projected handle, or disconnect for an ordinary value. */
	read(value: unknown): unknown;
	/** Read only the already connected channel; never reevaluate the authored projection. */
	get(): unknown;
	/** Prepare a different projection without replacing the currently published lease. */
	preview(value: unknown): BindingPreparedValue;
	/** Optional whole-style writer, present only on the selected style capability. */
	write?(value: unknown): void;
	dispose(preservePresentation?: boolean): void;
}

export interface BindingPreparedValue<T = unknown> extends NativeTransitionPresentation {
	readonly value: T;
}

/** @internal Imported accessors must not silently turn live reads into source snapshots. */
export function __assertBindingSnapshot<T>(read: () => T): T {
	let observed = false;
	const previous = setNativeReadObserver((source, version) => {
		observed = true;
		previous?.(source, version);
	});
	let value: T;
	let failed = false;
	let failure: unknown;
	try {
		value = read();
	} catch (error) {
		failed = true;
		failure = error;
	} finally {
		setNativeReadObserver(previous);
	}
	if (observed)
		throw Object.assign(new TypeError(formatClientError(308)), { code: 'OCTANE_DOM_BINDINGS' });
	if (failed) throw failure;
	return value!;
}

let bindingReads: Map<NativeReadSource, number> | null = null;

/**
 * @internal An imported signal read inside a subscribed program projection. The
 * program's read capability supplies the collection window; reads that throw
 * (a pending or failed async value) are still reported before they throw.
 */
export function __trackBindingRead<T>(read: () => T): T {
	const reads = bindingReads;
	if (reads === null) return read();
	const previous = setNativeReadObserver((source, version) => {
		// The first witness wins, so a later mixed read cannot pass validation.
		if (!reads.has(source)) reads.set(source, version);
		previous?.(source, version);
	});
	try {
		return read();
	} finally {
		setNativeReadObserver(previous);
	}
}

export interface BindingReadTracker {
	/** Run one preparation, collecting the sources its compiler-wrapped reads observe. */
	prepare<T>(run: () => T): T;
	/** Sources the current preparation has observed so far. */
	size(): number;
	/** A committed preparation owns exactly the sources it read. */
	publish(): void;
	/** Stage a transition preparation without releasing the published sources. */
	preview(): NativeTransitionPresentation;
	/**
	 * A preparation threw. Keep the last DOM and wait on every source it reached,
	 * plus the published ones: a pending value retries when it settles, and a
	 * later failure is reported. Returns false for a failure before the first
	 * commit, which the caller throws.
	 */
	fail(error: unknown, committed: boolean): boolean;
	dispose(): void;
}

/**
 * @internal Query-selected capability for programs whose projections read
 * imported signals. Any observed source change refreshes the whole program,
 * exactly like a `BindingSource` notification.
 */
export function __createBindingReads(notify: () => void): BindingReadTracker {
	const owner = currentSignalOwner();
	const run = owner === null ? <T>(callback: () => T): T => callback() : captureSignalOwner(owner);
	const subscriptions = new Map<NativeReadSource, () => void>();
	const waits = new WeakSet<object>();
	let reads = new Map<NativeReadSource, number>();
	let disposed = false;
	const acquire = (source: NativeReadSource): void => {
		let live = true;
		const stop = run(() =>
			source.subscribe(
				forwardNativeTransitionConsumer(notify, () => {
					if (live && !disposed) notify();
				}),
			),
		);
		if (typeof stop !== 'function') throw new TypeError(formatClientError(304));
		const cleanup = (): void => {
			live = false;
			stop();
		};
		if (disposed) cleanup();
		else subscriptions.set(source, cleanup);
	};
	const add = (): boolean => {
		let changed = false;
		for (const [source, version] of reads) {
			if (disposed) break;
			if (!subscriptions.has(source)) acquire(source);
			// A write between the read and its subscription has no notification.
			if (source.getVersion() !== version) changed = true;
		}
		return changed;
	};
	return {
		prepare(run) {
			const outer = bindingReads;
			bindingReads = reads = new Map();
			try {
				return run();
			} finally {
				bindingReads = outer;
			}
		},
		size: () => reads.size,
		publish() {
			for (const [source, stop] of subscriptions) {
				if (reads.has(source)) continue;
				subscriptions.delete(source);
				stop();
			}
			if (add()) notify();
		},
		fail(error, committed) {
			if (add()) notify();
			if (
				error !== null &&
				(typeof error === 'object' || typeof error === 'function') &&
				typeof (error as PromiseLike<unknown>).then === 'function'
			) {
				// A read reports its source before it suspends; only an opaque
				// thenable needs its own wake-up.
				if (reads.size === 0 && !waits.has(error)) {
					waits.add(error);
					const retry = (): void => {
						if (!disposed) notify();
					};
					(error as PromiseLike<unknown>).then(retry, retry);
				}
				return true;
			}
			if (!committed) return false;
			const report = (globalThis as { reportError?: (error: unknown) => void }).reportError;
			if (typeof report === 'function') report(error);
			else
				queueMicrotask(() => {
					throw error;
				});
			return true;
		},
		preview() {
			return __prepareBindingSources(reads, subscriptions, notify, () => !disposed, run);
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			let failed = false;
			let failure: unknown;
			for (const stop of subscriptions.values()) {
				try {
					stop();
				} catch (error) {
					if (!failed) {
						failed = true;
						failure = error;
					}
				}
			}
			subscriptions.clear();
			if (failed) throw failure;
		},
	};
}

/** @internal Query-selected capability; captures the existing owner, never creates a graph. */
export function __createBindingSignals() {
	const owner = currentSignalOwner();
	const run = owner === null ? <T>(callback: () => T): T => callback() : captureSignalOwner(owner);
	const isSignal = (value: unknown): value is SignalHandle<unknown> =>
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		(value as SignalHandle<unknown>)[SIGNAL_HANDLE] === true;
	return {
		isSignal,
		connect(notify: () => void): BindingSignalConnection {
			let value: unknown;
			let handle: SignalHandle<unknown> | undefined;
			let unsubscribe: (() => void) | undefined;
			let generation = 0;
			let disposed = false;
			const get = (): unknown =>
				disposed ? undefined : handle ? run(() => handle![SIGNAL_BINDING_READ]()) : value;
			const dispose = (): void => {
				if (disposed) return;
				disposed = true;
				generation++;
				handle = undefined;
				const stop = unsubscribe;
				unsubscribe = undefined;
				stop?.();
			};
			return {
				get,
				dispose,
				preview(next): BindingPreparedValue {
					const nextHandle = isSignal(next) ? next : undefined;
					const ticket = generation;
					const projected = nextHandle ? run(() => nextHandle[SIGNAL_BINDING_READ]()) : next;
					let accepted = false;
					let retired = false;
					let invalid = false;
					let acceptedGeneration = ticket;
					const stopNext =
						nextHandle && nextHandle !== handle
							? run(() =>
									nextHandle[SIGNAL_BINDING_SUBSCRIBE](
										forwardNativeTransitionConsumer(notify, () => {
											if (retired || disposed) return;
											if (!accepted) invalid = true;
											else if (generation === acceptedGeneration) notify();
										}),
									),
								)
							: undefined;
					return {
						value: projected,
						validate: () => !retired && !invalid && !disposed && generation === ticket,
						commit() {
							if (retired || accepted || disposed) return;
							accepted = true;
							value = next;
							if (nextHandle === handle) return;
							const stop = unsubscribe;
							acceptedGeneration = ++generation;
							handle = nextHandle;
							unsubscribe = stopNext;
							stop?.();
						},
						discard() {
							if (accepted || retired) return;
							retired = true;
							stopNext?.();
						},
					};
				},
				read(next): unknown {
					if (disposed) return undefined;
					const nextHandle = isSignal(next) ? next : undefined;
					if (nextHandle !== handle) {
						const ticket = ++generation;
						const stop = unsubscribe;
						unsubscribe = undefined;
						handle = undefined;
						stop?.();
						if (disposed) return undefined;
						handle = nextHandle;
						if (handle) {
							if (
								typeof handle[SIGNAL_BINDING_READ] !== 'function' ||
								typeof handle[SIGNAL_BINDING_SUBSCRIBE] !== 'function'
							)
								throw new TypeError(formatClientError(309));
							const stopNext = run(() =>
								handle![SIGNAL_BINDING_SUBSCRIBE](
									forwardNativeTransitionConsumer(notify, () => {
										if (!disposed && ticket === generation) notify();
									}),
								),
							);
							if (typeof stopNext !== 'function') throw new TypeError(formatClientError(310));
							if (disposed || ticket !== generation) stopNext();
							else unsubscribe = stopNext;
						}
					}
					value = next;
					return get();
				},
			};
		},
	};
}
