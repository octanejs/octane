/** Runtime brands for signal handles and legacy query requests. */
export const SIGNAL_HANDLE: unique symbol = Symbol.for('octane.signal-handle') as any;
export const SIGNAL_BINDING_READ: unique symbol = Symbol.for('octane.signal-binding-read') as any;
export const SIGNAL_BINDING_SUBSCRIBE: unique symbol = Symbol.for(
	'octane.signal-binding-subscribe',
) as any;
export const SIGNAL_BINDING_IDENTITY: unique symbol = Symbol.for(
	'octane.signal-binding-identity',
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
	/** @internal Observe invalidation without running user code during render. */
	readonly [SIGNAL_BINDING_SUBSCRIBE]: (notify: () => void) => () => void;
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

export interface DerivedOptions {
	/** Assert that the computation returns synchronously and skip async-shape detection. */
	readonly sync?: boolean;
}

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
	signal$<T>(key: string, initial: T): WritableSignal<T>;
	derived$<T>(
		key: string,
		compute: (() => T) & (T extends PromiseLike<unknown> ? never : unknown),
	): DerivedSignal<T>;
	asyncSignal$<T>(key: string, describe: () => QueryRequest<T> | typeof skip): Resource<T>;
	get<T>(handle$: SignalHandle<T>): T;
	set<T>(handle$: WritableSignal<T>, value: T | ((previous: T) => T)): void;
	isPending(read: () => unknown): boolean;
	batch<T>(write: () => T): T;
	action<F extends (...args: any[]) => any>(write: F): F;
	serialize(): ScopeSeed;
	beginAdoption(seed: ScopeSeed): AdoptionFrame;
	inspect(): ScopeInspection;
	dispose(): void;
}

export interface OwnerBoundSignal<T> extends SignalHandle<T> {
	readonly [SIGNAL_OWNER_RESOLVE]: (owner: Scope) => SignalHandle<T>;
}

export interface SignalOwnerEnvironment {
	current(): SignalOwner | null;
	run<T>(owner: SignalOwner, callback: () => T): T;
	capture(owner: SignalOwner): <T>(callback: () => T) => T;
}

/** A renderer identity is mapped lazily to a Scope only when signals are used. */
export interface SignalOwnerIdentity {
	readonly scopeKey: string;
}

export interface SignalRendererOwnerIdentity extends SignalOwnerIdentity {
	readonly documentOwner: SignalOwner;
	readonly instanceOwner: object;
	readonly instanceKey: string;
}

export type SignalOwner = Scope | SignalOwnerIdentity | SignalRendererOwnerIdentity;

export interface OptimisticSignal<T> extends WritableSignal<T> {}

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
