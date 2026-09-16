import { captureSignalOwner, currentSignalOwner } from './signals/owner-context.js';
import {
	forwardNativeTransitionConsumer,
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
								throw new TypeError('A DOM binding signal requires the native binding protocol.');
							const stopNext = run(() =>
								handle![SIGNAL_BINDING_SUBSCRIBE](
									forwardNativeTransitionConsumer(notify, () => {
										if (!disposed && ticket === generation) notify();
									}),
								),
							);
							if (typeof stopNext !== 'function')
								throw new TypeError('A DOM binding signal subscription must return cleanup.');
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
