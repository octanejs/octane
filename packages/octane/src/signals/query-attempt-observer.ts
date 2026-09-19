import type { SignalRendererOwnerIdentity } from './types.js';

export interface ServerSignalQueryAttempt {
	readonly ownerKey: string;
	readonly instanceKey: string;
	readonly nodeKey: string;
	readonly selectionKey: string;
	readonly attempt: number;
	readonly kind: 'promise' | 'stream';
	readonly result: unknown;
	readonly signal: AbortSignal;
	readonly isCurrent: () => boolean;
	/** Stop retaining and backpressuring this renderer observation. */
	readonly release: () => void;
}

export type ServerSignalQueryAttemptObserver = (attempt: ServerSignalQueryAttempt) => void;

export interface ServerSignalQueryAttemptObserverContext {
	readonly owner: SignalRendererOwnerIdentity;
	readonly observe: ServerSignalQueryAttemptObserver;
	readonly createObservations: () => ServerSignalQueryAttemptObservations;
}

export interface ServerSignalQueryAttemptSource {
	readonly nodeKey: string;
	readonly selectionKey: string;
	readonly attempt: number;
	readonly kind: 'promise' | 'stream';
	readonly result: unknown;
	readonly isCurrent: () => boolean;
}

/** The shared request engine owns a lease, not the server's transport mirrors. */
export interface ServerSignalQueryAttemptObservations {
	observe(
		context: ServerSignalQueryAttemptObserverContext,
		source: ServerSignalQueryAttemptSource,
	): void;
	publish(value: unknown): Promise<void> | undefined;
	complete(): void;
	fail(error: unknown): void;
	retire(): void;
}

let CURRENT_OBSERVER: ServerSignalQueryAttemptObserverContext | undefined;

/**
 * Install a synchronous renderer observation context around authored server
 * signal work. The context is restored before a returned promise can suspend,
 * so concurrent requests cannot inherit one another's observer.
 *
 * @internal
 */
export function runWithServerSignalQueryAttemptObserver<T>(
	owner: SignalRendererOwnerIdentity,
	observe: ServerSignalQueryAttemptObserver,
	createObservations: () => ServerSignalQueryAttemptObservations,
	callback: () => T,
): T {
	const previous = CURRENT_OBSERVER;
	CURRENT_OBSERVER = { owner, observe, createObservations };
	try {
		return callback();
	} finally {
		CURRENT_OBSERVER = previous;
	}
}

/** @internal Keep the browser/query fast path allocation-free when no server observer matches. */
export function serverSignalQueryAttemptObserver(
	scopeKey: string,
): ServerSignalQueryAttemptObserverContext | undefined {
	const context = CURRENT_OBSERVER;
	if (context === undefined) return;
	const ownerKey = context.owner.documentOwner.scopeKey;
	if (scopeKey !== ownerKey && scopeKey !== `${ownerKey}:instance:${context.owner.instanceKey}`) {
		return;
	}
	if (typeof context.createObservations !== 'function') {
		throw new TypeError('A server signal query observer requires an observation factory.');
	}
	return context;
}

export function hasServerSignalQueryAttemptObserver(scopeKey: string): boolean {
	return serverSignalQueryAttemptObserver(scopeKey) !== undefined;
}

/** @internal Preserve observation across a pending query description, not an async context. */
export function captureCurrentServerSignalQueryAttemptObserver(
	scopeKey: string,
): (<T>(callback: () => T) => T) | undefined {
	const context = serverSignalQueryAttemptObserver(scopeKey);
	if (context === undefined) return;
	return (callback) =>
		runWithServerSignalQueryAttemptObserver(
			context.owner,
			context.observe,
			context.createObservations,
			callback,
		);
}
