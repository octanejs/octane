import type { AdoptionFrame, ConnectionState, ScopeSeed, SignalHandle } from './types.js';
import type { SignalCandidateFrame } from './transition-candidate.js';
import type { ScopedNode } from './graph.js';

/** Explicit async reads own an observer edge instead of a synchronous graph edge. */
export const SIGNAL_DEPENDENT_NODE: unique symbol = Symbol('octane.signalDependent');
export type SignalDependencyNotify = (() => void) & { [SIGNAL_DEPENDENT_NODE]?: ScopedNode };

/** Only presentation subscriptions participate; public subscribers are never replayed. */
export const NATIVE_TRANSITION_CONSUMER: unique symbol = Symbol('octane.transitionConsumer');

export interface NativeTransitionConsumer {
	active(): boolean;
	prepare(): void | NativeTransitionPresentation;
}

/** Prepared host work stays private until every participating presentation is ready. */
export interface NativeTransitionPresentation {
	validate(): boolean;
	commit(): void;
	discard(): void;
}

export type NativeTransitionNotify = (() => void) & {
	[NATIVE_TRANSITION_CONSUMER]?: NativeTransitionConsumer;
};

/** Preserve presentation identity when an owner or lifetime wraps a subscription. */
export function forwardNativeTransitionConsumer<T extends () => void>(
	notify: NativeTransitionNotify,
	wrapped: T,
): T {
	const consumer = notify[NATIVE_TRANSITION_CONSUMER];
	if (consumer) (wrapped as NativeTransitionNotify)[NATIVE_TRANSITION_CONSUMER] = consumer;
	return wrapped;
}

let nativeActionResolver: (() => SignalCandidateFrame | undefined) | undefined;
let nativeCandidateResolver: (() => SignalCandidateFrame | undefined) | null | undefined;

/** Lazy renderer registration survives a reentrant synchronous input scope. */
export function registerNativeActionResolver(
	resolver: () => SignalCandidateFrame | undefined,
): void {
	nativeActionResolver = resolver;
}

export function getNativeCandidate(): SignalCandidateFrame | undefined {
	return nativeCandidateResolver === undefined
		? nativeActionResolver?.()
		: nativeCandidateResolver?.();
}

/** Restore before yielding; null suppresses even a newly registered Action resolver. */
export function setNativeCandidateResolver(
	resolver: (() => SignalCandidateFrame | undefined) | null | undefined,
): typeof resolver {
	const previous = nativeCandidateResolver;
	nativeCandidateResolver = resolver;
	return previous;
}

/** Detached DevTools metadata. Reading it must never evaluate or expose a value. */
export interface NativeReadInspection {
	readonly scopeKey: string;
	readonly key: string;
	readonly read: 'value' | 'latest' | 'snapshot';
	readonly kind: 'signal' | 'derived' | 'async';
	readonly status: 'idle' | 'ready' | 'pending' | 'error' | 'unevaluated';
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

/**
 * A candidate-only source keeps existing consumer and memo witnesses alive when
 * its graph is released. Acceptance is restricted to graph-native sources whose
 * revisions are monotonic and whose subscription operations run no user code.
 * The caller installs canonical state before accepting, and accepts all sources
 * before releasing the candidate graph or invoking public callbacks.
 */
export function createNativeReadCandidateSource(candidate: NativeReadSource) {
	let target: NativeReadSource | undefined = candidate;
	let accepted = false;
	let acceptedVersion = NaN;
	let canonicalVersion = NaN;
	const subscriptions = new Set<{ notify: () => void; dispose: () => void }>();
	const source: NativeReadSource = {
		getVersion: () =>
			target === undefined
				? NaN
				: !accepted
					? target.getVersion()
					: target.getVersion() === canonicalVersion
						? acceptedVersion
						: NaN,
		subscribe(notify) {
			if (target === undefined) throw new TypeError('The native read candidate has retired.');
			const subscription = { notify, dispose: target.subscribe(notify) };
			subscriptions.add(subscription);
			return () => {
				if (subscriptions.delete(subscription)) subscription.dispose();
			};
		},
		serialize(version) {
			return source.getVersion() === version
				? target?.serialize?.(accepted ? canonicalVersion : version)
				: undefined;
		},
	};
	if (candidate.inspect) source.inspect = () => target!.inspect!();
	return {
		source,
		accept(canonical: NativeReadSource, observedVersion: number): boolean {
			if (accepted || target === undefined || target.getVersion() !== observedVersion) return false;
			const version = canonical.getVersion();
			const acquired = new Map<{ notify: () => void; dispose: () => void }, () => void>();
			try {
				for (const subscription of subscriptions)
					acquired.set(subscription, canonical.subscribe(subscription.notify));
			} catch (error) {
				for (const dispose of acquired.values()) dispose();
				throw error;
			}
			// Every canonical lease precedes any candidate lease release.
			acceptedVersion = observedVersion;
			canonicalVersion = version;
			target = canonical;
			accepted = true;
			if (!canonical.inspect) delete source.inspect;
			for (const [subscription, dispose] of acquired) {
				subscription.dispose();
				subscription.dispose = dispose;
			}
			return true;
		},
		discard(): void {
			if (accepted || target === undefined) return;
			target = undefined;
			delete source.inspect;
			for (const subscription of subscriptions) subscription.dispose();
			subscriptions.clear();
		},
	};
}

export type NativeReadObserver = (source: NativeReadSource, version: number) => void;

let nativeReadObserver: NativeReadObserver | null = null;
let nativeWriteGuarded = false;

/** Private protocol implemented on native handles, never inferred from a get method. */
export const NATIVE_DOM_VALUE: unique symbol = Symbol('octane.nativeDomValue');

export function readNativeDomValue<T>(value: T): T extends SignalHandle<infer V> ? V : T;
export function readNativeDomValue(value: any): any {
	return value !== null && typeof value === 'object' && NATIVE_DOM_VALUE in value
		? value[NATIVE_DOM_VALUE]()
		: value;
}

/** Snapshot values so later writes can diff against the last applied style. */
export function readNativeDomStyle(value: any): any {
	value = readNativeDomValue(value);
	if (value === null || typeof value !== 'object') return value;
	const result: Record<string, unknown> = Object.create(null);
	for (const name in value) result[name] = readNativeDomValue(value[name]);
	return result;
}

export function readNativeDomProps(props: Record<string, unknown>): Record<string, unknown> {
	return 'style' in props ? { ...props, style: readNativeDomStyle(props.style) } : props;
}

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
