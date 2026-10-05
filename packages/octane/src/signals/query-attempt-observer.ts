import { formatClientError } from '../error-codes.client.generated.js';
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
	let context = CURRENT_OBSERVER;
	if (context === undefined) return;
	const ownerKey = context.owner.documentOwner.scopeKey;
	if (scopeKey !== ownerKey && scopeKey !== `${ownerKey}:instance:${context.owner.instanceKey}`) {
		// An inline row reads its enclosing owner's declarations. Observe that
		// cell under the owner that holds it, which the browser binds by key.
		let owner = context.owner.enclosingOwner;
		while (owner !== undefined && scopeKey !== `${ownerKey}:instance:${owner.instanceKey}`) {
			owner = owner.enclosingOwner;
		}
		if (owner === undefined) return;
		context = { owner, observe: context.observe, createObservations: context.createObservations };
	}
	if (typeof context.createObservations !== 'function') {
		throw new TypeError(formatClientError(192));
	}
	return context;
}

/**
 * @internal A function a body creates reads the handles it closes over as their
 * declaring owner (see __declared), wherever it renders. A render prop renders
 * inside the component it is passed to, whose owners need not enclose the
 * declaring one, so observe that read under the declaring owner, as that
 * owner's own render would. The walk up enclosing owners then starts there. A
 * render for another request's document never announces the read.
 */
export function runAsDeclaredServerSignalReader<T>(
	owner: SignalRendererOwnerIdentity,
	read: () => T,
): T {
	const context = CURRENT_OBSERVER;
	return context === undefined ||
		context.owner === owner ||
		context.owner.documentOwner !== owner.documentOwner
		? read()
		: runWithServerSignalQueryAttemptObserver(
				owner,
				context.observe,
				context.createObservations,
				read,
			);
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
