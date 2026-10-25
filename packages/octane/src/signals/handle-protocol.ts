import { SIGNAL_HANDLE, type SignalHandle, type WritableSignal } from './types.js';

// Protocol checks the renderer, the signal graph, and binding views share. They
// import only signals/types.ts: they must not import a graph or create an owner.

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

export function isThenable(value: unknown): value is PromiseLike<unknown> {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as PromiseLike<unknown>).then === 'function'
	);
}
