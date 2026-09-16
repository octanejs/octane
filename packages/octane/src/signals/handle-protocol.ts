import { SIGNAL_HANDLE, type SignalHandle, type WritableSignal } from './types.js';

/** Native handle capability checks must not import the graph or create an owner. */
export function isSignalHandle(value: unknown): value is SignalHandle<unknown> {
	return (
		(typeof value === 'object' || typeof value === 'function') &&
		value !== null &&
		(value as SignalHandle<unknown>)[SIGNAL_HANDLE] === true
	);
}

export function isWritableSignal(value: unknown): value is WritableSignal<unknown> {
	return (
		isSignalHandle(value) &&
		(value as { kind?: unknown }).kind === 'signal' &&
		typeof (value as { set?: unknown }).set === 'function'
	);
}
