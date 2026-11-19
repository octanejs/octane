import type { NativeReadSubscription } from './read-protocol.js';

/** Runtime brands for signal handles and legacy query requests. */
export const SIGNAL_HANDLE: unique symbol = Symbol.for('octane.signal-handle') as any;
export const SIGNAL_BINDING_READ: unique symbol = Symbol.for('octane.signal-binding-read') as any;
export const SIGNAL_BINDING_SUBSCRIBE: unique symbol = Symbol.for(
	'octane.signal-binding-subscribe',
) as any;
export const SIGNAL_BINDING_IDENTITY: unique symbol = Symbol.for(
	'octane.signal-binding-identity',
) as any;
export const SIGNAL_BINDING_RETIRED: unique symbol = Symbol.for(
	'octane.signal-binding-retired',
) as any;
export const QUERY_REQUEST: unique symbol = Symbol.for('octane.query-request') as any;
export const SIGNAL_OWNER_RESOLVE: unique symbol = Symbol.for('octane.signal-owner-resolve') as any;

/** A query selector result that deliberately selects no request. */
export const skip: unique symbol = Symbol.for('octane.query-skip') as any;

export type ConnectionState = 'none' | 'connecting' | 'open' | 'closed';

interface SnapshotActivity {
	readonly refreshing: boolean;
	readonly connection: ConnectionState;
	readonly complete: boolean;
	readonly requestKey?: string;
}

export type SignalSnapshot<T> = SnapshotActivity &
	(
		| { readonly status: 'ready'; readonly value: T }
		| { readonly status: 'idle' }
		| { readonly status: 'pending' }
		| { readonly status: 'error'; readonly error: unknown }
	);

export interface SignalHandle<T> {
	readonly [SIGNAL_HANDLE]: true;
	readonly [SIGNAL_BINDING_READ]: () => T;
	/** @internal Observe invalidation; optional teardown replaces the owning scope's final invalidation. */
	readonly [SIGNAL_BINDING_SUBSCRIBE]: (
		notify: () => void,
		onRetire?: () => void,
		speculative?: boolean,
	) => NativeReadSubscription;
	/** @internal Whether the handle's own owner retired, as `onRetire` would report. Failure paths only. */
	readonly [SIGNAL_BINDING_RETIRED]?: () => boolean;
	readonly [SIGNAL_BINDING_IDENTITY]: () => SignalBindingIdentity;
	readonly key: string;
	readonly kind: 'signal' | 'derived' | 'async';
	get(): T;
	latest(): T | undefined;
	latest<F>(fallback: F): T | F;
	snapshot(): SignalSnapshot<T>;
	/** Subscriptions do not deliver an initial notification. */
	subscribe(notify: () => void): () => void;
}

/** Stable renderer-facing identity for a direct signal binding. */
export interface SignalBindingIdentity {
	readonly scope: 'document' | 'instance';
	readonly nodeKey: string;
}

export interface WritableSignal<T> extends SignalHandle<T> {
	readonly kind: 'signal';
	set(value: T | ((previous: T) => T)): void;
}

export interface DerivedSignal<T> extends SignalHandle<T> {
	readonly kind: 'derived';
}

export interface AttemptRead {
	<T>(handle$: SignalHandle<T>): Promise<T>;
}

export interface DerivedContext {
	readonly signal: AbortSignal;
	readonly read: AttemptRead;
}

/** Whether `next` is equal to `previous`, the value a signal already holds. */
export type SignalEquals<T> = (previous: T, next: T) => boolean;

/** A signal a transaction changed: its value before the transaction and after it. */
export interface SignalChange<T = unknown> {
	readonly signal$: WritableSignal<T>;
	readonly previous: T;
	readonly next: T;
}

export interface SignalTransaction<T> {
	/** What the transaction's function returned. */
	readonly value: T;
	/**
	 * Each signal the transaction changed, once, in the order it first wrote
	 * it. A signal it wrote back to its previous value is left out.
	 */
	readonly changes: readonly SignalChange[];
	/**
	 * Write each change's previous value back, in one batch. A signal whose
	 * scope has retired is skipped. Inside another transaction it is recorded
	 * like any write.
	 */
	undo(): void;
	/** Write each change's next value again, in one batch. */
	redo(): void;
}

export interface ScopeSignalOptions<T> {
	/**
	 * Treat a new value as unchanged when this returns true: the signal keeps
	 * the previous value, by reference, and nothing downstream recomputes or is
	 * notified. Values Object.is finds equal are never compared. Defaults to
	 * Object.is alone. It runs untracked and must not write signals.
	 */
	readonly equals?: SignalEquals<T>;
	/**
	 * Runs, untracked, when the signal gains its first observer: an effect or
	 * subscriber that reads it, directly or through derived values. The function
	 * it returns runs when the last observer leaves or the scope is disposed, and
	 * the next first observer runs `watched` again. A read with no observer
	 * neither starts nor keeps it. An error either throws is reported, as
	 * `reportError` does, rather than thrown to the read or stop that ran it.
	 */
	readonly watched?: () => void | (() => void);
}

export interface SignalOptions {
	/** Stable authored identity; the compiler supplies a site when omitted. */
	readonly key?: string;
}

export interface DerivedOptions {
	/** Assert that the computation returns synchronously and skip async-shape detection. */
	readonly sync?: boolean;
}

/** Cell options belong to the first declaration resolved for an owner and site. */
export type AuthoredSignalOptions<T> = SignalOptions & ScopeSignalOptions<T>;

/** Observation and semantic equality are supported only for asserted synchronous derived cells. */
export type AuthoredDerivedOptions<T> = SignalOptions &
	(
		| (DerivedOptions & { readonly equals?: never; readonly watched?: never })
		| (ScopeSignalOptions<T> & { readonly sync: true })
	);

export interface QueryOptions {
	readonly kind?: 'promise' | 'stream';
}

export type DerivedCompute<T> = (
	context: DerivedContext,
) => T | PromiseLike<T | AsyncIterable<T>> | AsyncIterable<T>;

export type QueryLoadResult<T> = T | PromiseLike<T | AsyncIterable<T>> | AsyncIterable<T>;

export interface Resource<T> extends SignalHandle<T> {
	readonly kind: 'async';
	retry(options?: { pending?: boolean }): void;
}

export interface QuerySignal<T> extends Resource<T> {
	refetch(): void;
	reset(): void;
}

export interface QueryContext<T = unknown> {
	readonly signal: AbortSignal;
	readonly previous?: T;
}

export interface QueryRequest<T> {
	readonly [QUERY_REQUEST]: T;
	readonly queryKey: string;
}

export interface Query<A, T> {
	(argument: A): QueryRequest<T>;
	readonly queryKey: string;
	readonly kind: 'promise' | 'stream';
}

/** Tagged JSON data preserves undefined and -0 without colliding with authored objects. */
export type EncodedSignalValue =
	| ['undefined']
	| ['null']
	| ['boolean', boolean]
	| ['number', number | '-0']
	| ['string', string]
	| ['array', EncodedSignalValue[]]
	| ['object', [string, EncodedSignalValue][]];

export interface SignalSeedEntry {
	readonly key: string;
	readonly kind: 'signal' | 'derived' | 'async';
	/** Omission is the strict value channel. Retained values never seed it. */
	readonly read?: 'latest' | 'snapshot';
	/** Only a latest projection may explicitly represent no retained value. */
	readonly available?: boolean;
	readonly value: EncodedSignalValue;
	readonly request?: {
		readonly queryKey: string;
		readonly kind: 'promise' | 'stream';
		readonly argument: EncodedSignalValue;
	};
	readonly complete: boolean;
	readonly refreshing?: boolean;
	readonly connection?: ConnectionState;
}

export interface ScopeSeed {
	readonly version: 1;
	readonly scopeKey: string;
	readonly entries: readonly SignalSeedEntry[];
}

/** A lease on immutable presented values. Releasing it never rewrites live state. */
export interface AdoptionFrame {
	readonly scopeKey: string;
	readonly released: boolean;
	run<T>(read: () => T): T;
	retain(): AdoptionFrame;
	release(): void;
}

export interface SignalTraceEvent {
	readonly sequence: number;
	readonly type: 'write' | 'invalidate' | 'select' | 'publish' | 'retry' | 'retire' | 'frame';
	readonly key?: string;
	readonly revision?: number;
}

export interface ScopeInspection {
	readonly scopeKey: string;
	readonly epoch: number;
	readonly retired: boolean;
	readonly activeRequests: number;
	readonly adoptionLeases: number;
	readonly nodes: readonly {
		readonly key: string;
		readonly kind: 'signal' | 'derived' | 'async';
		readonly status: 'idle' | 'ready' | 'pending' | 'error' | 'unevaluated';
		readonly revision: number;
		readonly subscribers: number;
		readonly retained: boolean;
		readonly refreshing: boolean;
		readonly connection: ConnectionState;
		readonly complete: boolean;
		readonly dependencies: readonly { readonly scopeKey: string; readonly key: string }[];
	}[];
	readonly trace: readonly SignalTraceEvent[];
}

export interface ScopeOptions {
	readonly scopeKey: string;
	readonly seed?: ScopeSeed;
	/** Explicitly enable bounded metadata-only tracing; no values are retained in the trace. */
	readonly debug?: { readonly traceLimit?: number };
}

export interface Scope {
	readonly scopeKey: string;
	readonly epoch: number;
	readonly retired: boolean;
	/**
	 * A writable signal under `key`. With a `null` key it is keyless: nothing
	 * serializes, inspects or reseeds it, a transition does not stage its writes,
	 * and it takes no room in the scope's key table.
	 */
	signal$<T>(key: string | null, initial: T, options?: ScopeSignalOptions<T>): WritableSignal<T>;
	/**
	 * A derived value under `key`. With a `null` key it is keyless: it belongs to
	 * no scope, keeps no provenance, and is never serialized, inspected, reseeded
	 * or staged by a transition.
	 */
	derived$<T>(
		key: string | null,
		compute: (() => T) & (T extends PromiseLike<unknown> ? never : unknown),
		options?: ScopeSignalOptions<T>,
	): DerivedSignal<T>;
	get<T>(handle$: SignalHandle<T>): T;
	set<T>(handle$: WritableSignal<T>, value: T | ((previous: T) => T)): void;
	isPending(read: () => unknown): boolean;
	batch<T>(write: () => T): T;
	/**
	 * Run `write` synchronously in a batch that records each signal it changes.
	 * If `write` throws, or returns a promise, those signals take back their
	 * values before the batch ends and the error is rethrown, so no subscriber
	 * hears of the failed writes. Otherwise it returns `write`'s result with the
	 * changes, one per signal, and functions that write them back or again.
	 */
	transaction<T>(
		write: (() => T) & (T extends PromiseLike<unknown> ? never : unknown),
	): SignalTransaction<T>;
	/**
	 * Run `run` now and again whenever a signal it read changes, after the batch
	 * that changed it. A function it returns is called before its next run and
	 * when the effect stops. Returns a function that stops it; the scope stops it
	 * when it retires.
	 */
	effect(run: () => void | (() => void)): () => void;
	action<F extends (...args: any[]) => any>(write: F): F;
	serialize(): ScopeSeed;
	beginAdoption(seed: ScopeSeed): AdoptionFrame;
	inspect(): ScopeInspection;
	dispose(): void;
}

export interface FamilyOptions<K> {
	/**
	 * Map a key to the identity members are found by, such as a string for a
	 * tuple. Keys are otherwise compared as a Map compares them.
	 */
	readonly keyOf?: (key: K) => unknown;
	/**
	 * Evict a member this many milliseconds after it was last observed, as a
	 * `watched` hook counts observers: an effect, subscription or renderer
	 * binding, directly or through derived values. Members are otherwise
	 * evicted only by `delete`, `clear` or the scope's disposal.
	 */
	readonly idle?: number;
}

/** Scope-owned keyless members, one per logical key. */
export interface SignalFamily<K, H extends SignalHandle<unknown>> {
	readonly size: number;
	/** The key's member, created by the family's `create` on first use. */
	get(key: K): H;
	has(key: K): boolean;
	/** Evict and retire the key's member; a later `get` creates a new one. */
	delete(key: K): boolean;
	clear(): void;
}

/**
 * @internal A scope the runtime creates. It lacks the members only
 * createScope installs (installPublicScope), so internal code that reaches for
 * one fails to typecheck instead of failing in applications that never call
 * createScope.
 */
export type OwnerScope = Omit<
	Scope,
	| 'derived$'
	| 'get'
	| 'set'
	| 'isPending'
	| 'batch'
	| 'transaction'
	| 'effect'
	| 'action'
	| 'serialize'
	| 'inspect'
>;

export interface OwnerBoundSignal<T> extends SignalHandle<T> {
	readonly [SIGNAL_OWNER_RESOLVE]: (owner: OwnerScope) => SignalHandle<T>;
}

/**
 * A host carrier for the active owner, such as AsyncLocalStorage on a server.
 * It carries owners as identities and never calls them: an owner the runtime
 * created for compiled declarations has no public Scope methods until the
 * program calls createScope, currentSignalOwner or this package's
 * installSignalOwnerEnvironment.
 */
export interface SignalOwnerEnvironment {
	current(): SignalOwnerIdentity | null;
	run<T>(owner: SignalOwnerIdentity, callback: () => T): T;
	capture(owner: SignalOwnerIdentity): <T>(callback: () => T) => T;
}

/** A renderer identity is mapped lazily to a Scope only when signals are used. */
export interface SignalOwnerIdentity {
	readonly scopeKey: string;
}

export interface SignalRendererOwnerIdentity extends SignalOwnerIdentity {
	readonly documentOwner: SignalOwner;
	readonly instanceOwner: object;
	readonly instanceKey: string;
	/** A directive arm's or inline row's enclosing owner. Component instances have none. */
	readonly enclosingOwner?: SignalRendererOwnerIdentity | undefined;
}

export type SignalOwner = Scope | SignalOwnerIdentity | SignalRendererOwnerIdentity;

export interface OptimisticSignal<T> extends WritableSignal<T> {}

export interface OptimisticOptions<T> {
	/**
	 * Compare authoritative revisions, not client invocation order or optimistic values.
	 * Return a finite positive number only when incoming is newer than current.
	 * Equal or older receipts settle their operation without replacing the source.
	 * The callback must be pure. Omitted policies reuse an existing source policy;
	 * otherwise adoption is unversioned and cannot order concurrent server receipts.
	 */
	readonly compareAuthority?: (incoming: T, current: T) => number;
}

export interface ActionUncertain {
	readonly status: 'uncertain';
	readonly operationId: string;
}

export interface ActionOperation {
	readonly id: string;
	readonly key: string;
	readonly status: 'pending' | 'confirmed' | 'rejected' | 'uncertain';
	set<T>(signal$: OptimisticSignal<T>, value: T | ((previous: T) => T)): void;
	adopt<T>(value: T): void;
	/** Remove only this operation's intent after a definitive rejection. */
	reject(): void;
	uncertain(): ActionUncertain;
	until(read: () => unknown, options?: { timeout?: number }): Promise<void>;
}

export type SignalAction<F extends (operation: ActionOperation, ...args: any[]) => any> = (
	...args: F extends (operation: ActionOperation, ...args: infer A) => any ? A : never
) => ReturnType<F>;
