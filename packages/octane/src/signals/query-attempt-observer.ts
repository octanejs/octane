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

interface ObserverContext {
	readonly owner: SignalRendererOwnerIdentity;
	readonly observe: ServerSignalQueryAttemptObserver;
}

export interface ServerSignalQueryAttemptSource {
	readonly scopeKey: string;
	readonly nodeKey: string;
	readonly selectionKey: string;
	readonly attempt: number;
	readonly kind: 'promise' | 'stream';
	readonly result: unknown;
	readonly signal: AbortSignal;
	readonly isCurrent: () => boolean;
	readonly release: () => void;
}

let CURRENT_OBSERVER: ObserverContext | undefined;

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
	callback: () => T,
): T {
	const previous = CURRENT_OBSERVER;
	CURRENT_OBSERVER = { owner, observe };
	try {
		return callback();
	} finally {
		CURRENT_OBSERVER = previous;
	}
}

/** @internal Capture the request owner for a later synchronous authored callback. */
export function captureServerSignalQueryAttemptObserver(
	owner: SignalRendererOwnerIdentity,
	observe: ServerSignalQueryAttemptObserver,
): <T>(callback: () => T) => T {
	return (callback) => runWithServerSignalQueryAttemptObserver(owner, observe, callback);
}

/** @internal Keep the browser/query fast path allocation-free when no server observer matches. */
export function hasServerSignalQueryAttemptObserver(scopeKey: string): boolean {
	const context = CURRENT_OBSERVER;
	if (context === undefined) return false;
	const ownerKey = context.owner.documentOwner.scopeKey;
	return scopeKey === ownerKey || scopeKey === `${ownerKey}:instance:${context.owner.instanceKey}`;
}

/** @internal Preserve observation across a pending query description, not an async context. */
export function captureCurrentServerSignalQueryAttemptObserver(
	scopeKey: string,
): (<T>(callback: () => T) => T) | undefined {
	if (!hasServerSignalQueryAttemptObserver(scopeKey)) return;
	const context = CURRENT_OBSERVER!;
	return captureServerSignalQueryAttemptObserver(context.owner, context.observe);
}

/** @internal Publish one engine attempt only to the exact active renderer owner. */
export function observeServerSignalQueryAttempt(source: ServerSignalQueryAttemptSource): boolean {
	const context = CURRENT_OBSERVER;
	if (context === undefined) return false;
	const ownerKey = context.owner.documentOwner.scopeKey;
	if (
		source.scopeKey !== ownerKey &&
		source.scopeKey !== `${ownerKey}:instance:${context.owner.instanceKey}`
	) {
		return false;
	}
	context.observe({
		ownerKey,
		instanceKey: context.owner.instanceKey,
		nodeKey: source.nodeKey,
		selectionKey: source.selectionKey,
		attempt: source.attempt,
		kind: source.kind,
		result: source.result,
		signal: source.signal,
		isCurrent: source.isCurrent,
		release: source.release,
	});
	return true;
}
