import { __withBindingObservations, type BindingObservations } from './dom-binding-observations.js';
import { formatClientError } from './error-codes.client.generated.js';
import { captureSignalOwner, currentSignalOwner } from './signals/owner-context.js';
import { __retiredBindingSource } from './dom-binding-styles.js';
import {
	setNativeReadObserver,
	type NativeReadSource,
	type NativeReadSubscription,
} from './signals/read-protocol.js';
import { isSignalHandle } from './signals/handle-protocol.js';
import {
	SIGNAL_BINDING_READ,
	SIGNAL_BINDING_RETIRED,
	SIGNAL_BINDING_SUBSCRIBE,
	type SignalHandle,
} from './signals/types.js';

export interface BindingSignalConnection {
	/** Resolve and observe a projected handle, or disconnect for an ordinary value. */
	read(value: unknown): unknown;
	/** Read only the already connected channel; never reevaluate the authored projection. */
	get(committed?: boolean): unknown;
	readAccepted?(value: unknown): { valid: boolean; value: unknown };
	publishAccepted?(): void;
	publishAcceptedValue?(value: unknown): void;
	/** Optional whole-style writer, present only on the selected style capability. */
	write?(value: unknown): void;
	/** Error path only: whether the owner of a source this connection observes retired. */
	retired(): boolean;
	/** Select this connection only after its own binding was accepted. */
	accept(): void;
	dispose(preservePresentation?: boolean): void;
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
	/**
	 * A committed preparation owns exactly the sources it read. An accepted
	 * refresh committed under a `held` replacement adds its sources and keeps
	 * the ones the replacement still waits on.
	 */
	publish(held?: boolean): void;
	/**
	 * The replacement just prepared suspended. Whether a source the accepted
	 * commit observes, and the replacement does not read, has changed since:
	 * only then can an accepted refresh present anything new.
	 */
	hold(): boolean;
	/** An accepted refresh kept a pending part: drop the reads made after `from`. */
	keep(from: number): void;
	/**
	 * Whether an accepted refresh preserved the accepted selection: it read
	 * only sources the accepted commit observes, none the replacement reads.
	 */
	accepts(): boolean;
	/**
	 * A preparation threw. Keep the last DOM and wait on every source it reached,
	 * plus the published ones: a pending value retries when it settles, and a
	 * later failure is reported. Returns false for a failure before the first
	 * commit, which the caller throws.
	 */
	fail(error: unknown, committed: boolean): boolean;
	/** Error path only: whether the owner of a subscribed source retired. */
	retired(): boolean;
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
	const subscriptions = new Map<NativeReadSource, NativeReadSubscription>();
	const waits = new WeakSet<object>();
	let reads = new Map<NativeReadSource, number>();
	let published = new Map<NativeReadSource, number>();
	let staged = reads;
	let disposed = false;
	const acquire = (source: NativeReadSource): void => {
		let live = true;
		const stop = run(() =>
			source.subscribe(() => {
				if (live && !disposed) notify();
			}, true),
		);
		if (typeof stop !== 'function') throw new TypeError(formatClientError(304));
		const cleanup: NativeReadSubscription = (): void => {
			live = false;
			stop();
		};
		if (stop.observation !== undefined) cleanup.observation = stop.observation;
		if (disposed) cleanup();
		else subscriptions.set(source, cleanup);
	};
	const add = (published: boolean): boolean => {
		let changed = false;
		for (const [source, version] of reads) {
			if (disposed) break;
			if (!subscriptions.has(source)) acquire(source);
			if (published) subscriptions.get(source)?.observation?.setObserved(true);
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
		publish(held) {
			if (held) for (const [source, version] of reads) published.set(source, version);
			else {
				published = reads;
				for (const [source, stop] of subscriptions) {
					if (reads.has(source)) continue;
					subscriptions.delete(source);
					stop();
				}
			}
			if (add(!held)) notify();
		},
		hold() {
			staged = reads;
			for (const [source, version] of published)
				if (!staged.has(source) && source.getVersion() !== version) return true;
			return false;
		},
		keep(from) {
			let index = 0;
			for (const source of [...reads.keys()]) if (index++ >= from) reads.delete(source);
		},
		accepts() {
			for (const source of reads.keys())
				if (!published.has(source) || staged.has(source)) return false;
			return true;
		},
		fail(error, committed) {
			if (add(false)) notify();
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
		retired: () => __retiredBindingSource(subscriptions),
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
const createBindingSignals = function __createBindingSignals(observations?: BindingObservations) {
	const owner = currentSignalOwner();
	const run = owner === null ? <T>(callback: () => T): T => callback() : captureSignalOwner(owner);
	return {
		isSignal: isSignalHandle,
		connect(notify: (committed?: boolean) => void): BindingSignalConnection {
			let value: unknown;
			let handle: SignalHandle<unknown> | undefined;
			let acceptedValue: unknown;
			let acceptedHandle: SignalHandle<unknown> | undefined;
			const observation = observations?.owner(() => {
				acceptedValue = value;
				acceptedHandle = handle;
			});
			let unsubscribe: NativeReadSubscription | undefined;
			let generation = 0;
			let disposed = false;
			const get = (committed = false): unknown => {
				const selected = committed ? acceptedHandle : handle;
				return disposed
					? undefined
					: selected
						? run(() => selected[SIGNAL_BINDING_READ]())
						: committed
							? acceptedValue
							: value;
			};
			const dispose = (): void => {
				if (disposed) return;
				disposed = true;
				generation++;
				handle = undefined;
				const stop = unsubscribe;
				unsubscribe = undefined;
				if (stop) observations ? observations.release(observation!, stop) : stop();
				if (observation) observations!.accept(observation);
			};
			return {
				get,
				accept: () => {
					if (
						observation &&
						(acceptedValue !== value ||
							acceptedHandle !== handle ||
							observation.pending?.size ||
							observation.retired?.size)
					)
						observations!.accept(observation);
				},
				dispose,
				// Only a subscribed handle is observed. Its own owner retiring wakes
				// this connection, and the read that follows throws.
				retired(): boolean {
					try {
						return (
							!!unsubscribe &&
							!observation?.pending?.has(unsubscribe) &&
							run(() => handle![SIGNAL_BINDING_RETIRED]?.()) === true
						);
					} catch {
						// An unresolvable handle is not proof of retirement; report.
						return false;
					}
				},
				read(next): unknown {
					if (disposed) return undefined;
					const nextHandle = isSignalHandle(next) ? next : undefined;
					if (nextHandle !== handle) {
						const ticket = ++generation;
						const stop = unsubscribe;
						unsubscribe = undefined;
						handle = undefined;
						if (stop) observations ? observations.release(observation!, stop) : stop();
						if (disposed) return undefined;
						handle = nextHandle;
						if (handle) {
							if (
								typeof handle[SIGNAL_BINDING_READ] !== 'function' ||
								typeof handle[SIGNAL_BINDING_SUBSCRIBE] !== 'function'
							)
								throw new TypeError(formatClientError(309));
							let stopNext: NativeReadSubscription | undefined;
							stopNext = run(() =>
								handle![SIGNAL_BINDING_SUBSCRIBE](
									() => {
										if (
											!disposed &&
											(ticket === generation || observation?.retired?.has(stopNext!))
										)
											observations ? observations.notify(observation!, stopNext, notify) : notify();
									},
									observations ? () => observations.retire(observation!, stopNext) : undefined,
									!!observations,
								),
							);
							if (typeof stopNext !== 'function') throw new TypeError(formatClientError(310));
							if (observations && !observations.add(observation!, stopNext)) return undefined;
							if (disposed || ticket !== generation)
								observations ? observations.release(observation!, stopNext) : stopNext();
							else unsubscribe = stopNext;
						}
					}
					value = next;
					return get();
				},
			};
		},
	};
};

export const __createBindingSignals =
	/* @__PURE__ */ __withBindingObservations(createBindingSignals);
