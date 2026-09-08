import type { AdoptionFrame, ConnectionState, ScopeSeed } from './types.js';

/** Detached DevTools metadata. Reading it must never evaluate or expose a value. */
export interface NativeReadInspection {
	readonly scopeKey: string;
	readonly key: string;
	readonly read: 'value' | 'latest' | 'snapshot';
	readonly kind: 'signal' | 'derived' | 'async';
	readonly status: 'ready' | 'pending' | 'error' | 'unevaluated';
	readonly revision: number;
	readonly generation?: number;
	readonly epoch: number;
	readonly retired: boolean;
	readonly historical: boolean;
	readonly retained: boolean;
	readonly refreshing: boolean;
	readonly connection: ConnectionState;
	readonly complete: boolean;
	readonly dependencies: readonly { readonly scopeKey: string; readonly key: string }[];
}

/**
 * The engine reports native reads through this renderer-free channel. Keeping
 * the channel separate from either runtime lets the engine run without DOM or
 * server dependencies, and lets compiled native readers select their renderer.
 */
export interface NativeReadSource {
	/**
	 * A conservative invalidation revision. Reading it must not evaluate user
	 * computations. A historical source reports its lease revision independently
	 * of the live source whose value was captured.
	 */
	getVersion(): number;
	/** Subscribe without evaluating a user computation. */
	subscribe(notify: () => void): () => void;
	/** Ready values from the observed revision, without running computations. */
	serialize?(observedVersion: number): readonly NativeSerializedScope[] | undefined;
	/** On-demand metadata for a currently referenced source, with no global graph registry. */
	inspect?(): NativeReadInspection;
}

export type NativeReadObserver = (source: NativeReadSource, version: number) => void;

let nativeReadObserver: NativeReadObserver | null = null;
let nativeWriteGuarded = false;

/** A renderer supplies historical data only for a data scope actually read. */
export interface NativeAdoptionOwner {
	readonly scopeKey: string;
	beginAdoption(seed: ScopeSeed): AdoptionFrame;
}

/** Exact ownership accompanies renderer serialization but is never sent on the wire. */
export interface NativeSerializedScope {
	readonly owner: NativeAdoptionOwner;
	readonly seed: ScopeSeed;
}

export type NativeAdoptionResolver = (owner: NativeAdoptionOwner) => AdoptionFrame | undefined;
let nativeAdoptionResolver: NativeAdoptionResolver | null = null;

/** Internal hydration control flow, never an application error-boundary value. */
export class NativeAdoptionMiss extends Error {
	readonly scopeKey: string;
	readonly nodeKey: string;
	readonly read: 'value' | 'latest' | 'snapshot';

	constructor(scopeKey: string, nodeKey: string, read: 'value' | 'latest' | 'snapshot' = 'value') {
		super('Native hydration has no ' + read + ' seed for ' + scopeKey + ':' + nodeKey + '.');
		this.name = 'NativeAdoptionMiss';
		this.scopeKey = scopeKey;
		this.nodeKey = nodeKey;
		this.read = read;
	}
}

export function getNativeAdoptionResolver(): NativeAdoptionResolver | null {
	return nativeAdoptionResolver;
}

/** The caller restores the previous resolver in a synchronous finally block. */
export function setNativeAdoptionResolver(
	resolver: NativeAdoptionResolver | null,
): NativeAdoptionResolver | null {
	const previous = nativeAdoptionResolver;
	nativeAdoptionResolver = resolver;
	return previous;
}

export interface NativeBatchHooks {
	startBatch(): void;
	endBatch(): void;
}

let nativeBatchHooks: NativeBatchHooks | null = null;

/** Engine registration does not make either renderer import the graph package. */
export function registerNativeBatchHooks(hooks: NativeBatchHooks): void {
	nativeBatchHooks = hooks;
}

/** Return the exact engine pair so nested registration cannot unbalance a batch. */
export function beginNativeBatch(): NativeBatchHooks | null {
	const hooks = nativeBatchHooks;
	hooks?.startBatch();
	return hooks;
}

export function endNativeBatch(hooks: NativeBatchHooks | null): void {
	hooks?.endBatch();
}

export function runNativeBatch<T>(callback: () => T): T {
	const hooks = beginNativeBatch();
	try {
		return callback();
	} finally {
		endNativeBatch(hooks);
	}
}

/** Report the revision actually read, including reads that subsequently throw. */
export function reportNativeRead(source: NativeReadSource, version: number): void {
	nativeReadObserver?.(source, version);
}

export function getNativeReadObserver(): NativeReadObserver | null {
	return nativeReadObserver;
}

/** The caller restores the returned observer in a synchronous finally block. */
export function setNativeReadObserver(
	observer: NativeReadObserver | null,
): NativeReadObserver | null {
	const previous = nativeReadObserver;
	nativeReadObserver = observer;
	return previous;
}

/**
 * Render/adoption purity is independent of dependency collection. Disabling
 * collection for a loader or snapshot must not permit it to write during a
 * render. Like the read observer, this guard must never span an async gap.
 */
export function beginNativeWriteGuard(): boolean {
	const previous = nativeWriteGuarded;
	nativeWriteGuarded = true;
	return previous;
}

export function endNativeWriteGuard(previous: boolean): void {
	nativeWriteGuarded = previous;
}

export function isNativeWriteGuarded(): boolean {
	return nativeWriteGuarded;
}
