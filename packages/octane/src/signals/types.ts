/** Nominal marker for the experimental native signal API; it has no runtime payload. */
export declare const SIGNAL_HANDLE: unique symbol;
export declare const QUERY_REQUEST: unique symbol;

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
		| { readonly status: 'pending' }
		| { readonly status: 'error'; readonly error: unknown }
	);

export interface SignalHandle<T> {
	readonly [SIGNAL_HANDLE]: T;
	readonly key: string;
	get(): T;
	latest(): T | undefined;
	latest<F>(fallback: F): T | F;
	snapshot(): SignalSnapshot<T>;
	/** Subscriptions do not deliver an initial notification. */
	subscribe(notify: () => void): () => void;
}

export interface WritableSignal<T> extends SignalHandle<T> {
	readonly kind: 'signal';
	set(value: T | ((previous: T) => T)): void;
}

export interface DerivedSignal<T> extends SignalHandle<T> {
	readonly kind: 'derived';
}

export interface Resource<T> extends SignalHandle<T> {
	readonly kind: 'async';
	retry(options?: { pending?: boolean }): void;
}

export interface QueryContext {
	readonly signal: AbortSignal;
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
		readonly status: 'ready' | 'pending' | 'error' | 'unevaluated';
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
	asyncSignal$<T>(key: string, describe: () => QueryRequest<T>): Resource<T>;
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
