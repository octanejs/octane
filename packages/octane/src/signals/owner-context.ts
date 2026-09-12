import type { SignalOwner, SignalOwnerEnvironment } from './types.js';

let installedEnvironment: SignalOwnerEnvironment | undefined;
let synchronousOwner: SignalOwner | null = null;
let defaultOwner: (() => SignalOwner | null) | undefined;
let retireOwner: ((owner: SignalOwner) => void) | undefined;

/** Install a concurrency-safe owner carrier without importing the signal engine. */
export function installSignalOwnerEnvironment(environment: SignalOwnerEnvironment): () => void {
	if (
		!environment ||
		typeof environment.current !== 'function' ||
		typeof environment.run !== 'function' ||
		typeof environment.capture !== 'function'
	) {
		throw new TypeError('A signal owner environment requires current, run, and capture.');
	}
	const previous = installedEnvironment;
	installedEnvironment = environment;
	return () => {
		if (installedEnvironment === environment) installedEnvironment = previous;
	};
}

export function currentSignalOwner(): SignalOwner | null {
	// A server carrier returning no request must not acquire browser authority.
	if (installedEnvironment !== undefined) return installedEnvironment.current() ?? synchronousOwner;
	return synchronousOwner ?? defaultOwner?.() ?? null;
}

/** @internal Client renderer installs its lazy document owner, never a last-root owner. */
export function installDefaultSignalOwner(current: () => SignalOwner | null): () => void {
	if (typeof current !== 'function')
		throw new TypeError('A default signal owner requires a provider.');
	const previous = defaultOwner;
	defaultOwner = current;
	return () => {
		if (defaultOwner === current) defaultOwner = previous;
	};
}

/** Enter an owner for a synchronous declaration, read, write, or callback. */
export function runWithSignalOwner<T>(owner: SignalOwner, callback: () => T): T {
	if (typeof callback !== 'function') throw new TypeError('A signal owner callback is required.');
	if (installedEnvironment) return installedEnvironment.run(owner, callback);
	const previous = synchronousOwner;
	synchronousOwner = owner;
	try {
		return callback();
	} finally {
		synchronousOwner = previous;
	}
}

/** @internal Synchronous SSR entry without retaining a callback frame per component. */
export function enterSynchronousSignalOwner(owner: SignalOwner): SignalOwner | null | undefined {
	// A host carrier owns its execution boundary and cannot be replaced by the
	// synchronous fallback. The caller must retain runWithSignalOwner in this case.
	if (installedEnvironment !== undefined) return undefined;
	const previous = synchronousOwner;
	synchronousOwner = owner;
	return previous;
}

/** @internal Pair with a successful synchronous entry in a finally block. */
export function restoreSynchronousSignalOwner(previous: SignalOwner | null): void {
	synchronousOwner = previous;
}

export function captureSignalOwner(owner: SignalOwner): <T>(callback: () => T) => T {
	return (
		installedEnvironment?.capture(owner) ?? ((callback) => runWithSignalOwner(owner, callback))
	);
}

/** Retire renderer-created identity state without linking the renderer to the engine. */
export function retireSignalOwnerIdentity(owner: SignalOwner): void {
	retireOwner?.(owner);
}

export function installSignalOwnerRetirement(retire: (owner: SignalOwner) => void): () => void {
	const previous = retireOwner;
	retireOwner = retire;
	return () => {
		if (retireOwner === retire) retireOwner = previous;
	};
}
