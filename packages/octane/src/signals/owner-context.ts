import { formatClientError } from '../error-codes.client.generated.js';
import type { SignalOwner, SignalOwnerEnvironment } from './types.js';

let installedEnvironment: SignalOwnerEnvironment | undefined;
let synchronousOwner: SignalOwner | null = null;
let defaultOwner: (() => SignalOwner | null) | undefined;
let retireOwner: ((owner: SignalOwner) => void) | undefined;
let supersedeOwner: ((owner: SignalOwner) => boolean) | undefined;

/** @internal Live capability guards; reading them never installs a default owner. */
export {
	installedEnvironment as activeSignalOwnerEnvironment,
	synchronousOwner as activeSynchronousSignalOwner,
};

/** Install a concurrency-safe owner carrier without importing the signal engine. */
export function installSignalOwnerEnvironment(environment: SignalOwnerEnvironment): () => void {
	if (
		!environment ||
		typeof environment.current !== 'function' ||
		typeof environment.run !== 'function' ||
		typeof environment.capture !== 'function'
	) {
		throw new TypeError(formatClientError(189));
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

/** @internal Distinguish an active owner frame from the lazy document fallback. */
export function currentExplicitSignalOwner(): SignalOwner | null {
	return installedEnvironment?.current() ?? synchronousOwner;
}

/** @internal Client renderer installs its lazy document owner, never a last-root owner. */
export function installDefaultSignalOwner(current: () => SignalOwner | null): () => void {
	if (typeof current !== 'function') throw new TypeError(formatClientError(190));
	const previous = defaultOwner;
	defaultOwner = current;
	return () => {
		if (defaultOwner === current) defaultOwner = previous;
	};
}

/** Enter an owner for a synchronous declaration, read, write, or callback. */
export function runWithSignalOwner<T>(owner: SignalOwner, callback: () => T): T {
	if (typeof callback !== 'function') throw new TypeError(formatClientError(191));
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

/**
 * @internal Hand a suspended attempt's renderer owner to a restart with new
 * inputs, or return false when its cells cannot follow them. A query$
 * re-selects from the values its description captures, so its request
 * survives them; a writable signal's initial value and an asynchronous
 * derived$ result do not. Unset until the facade loads.
 */
export { supersedeOwner as supersedeSignalOwner };

export function installSignalOwnerRetirement(
	retire: (owner: SignalOwner) => void,
	supersede?: (owner: SignalOwner) => boolean,
): () => void {
	const previous = retireOwner;
	const previousSupersede = supersedeOwner;
	retireOwner = retire;
	supersedeOwner = supersede;
	return () => {
		if (retireOwner !== retire) return;
		retireOwner = previous;
		supersedeOwner = previousSupersede;
	};
}
