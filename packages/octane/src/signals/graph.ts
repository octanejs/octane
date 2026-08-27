import {
	createReactiveSystem,
	type ReactiveFlags as AlienReactiveFlags,
	type ReactiveNode,
} from 'alien-signals/system';
import {
	ScopeDisposedError,
	SignalCycleError,
	SignalFrameError,
	SignalWriteError,
} from './errors.js';
import {
	NativeAdoptionMiss,
	getNativeReadObserver,
	getNativeAdoptionResolver,
	isNativeWriteGuarded,
	reportNativeRead,
	setNativeReadObserver,
	type NativeReadInspection,
	type NativeReadSource,
	type NativeSerializedScope,
} from './read-protocol.js';
import type {
	AdoptionFrame,
	ConnectionState,
	ScopeSeed,
	SIGNAL_HANDLE,
	SignalHandle,
	SignalSnapshot,
	SignalTraceEvent,
} from './types.js';

export interface GraphOwner {
	readonly scopeKey: string;
	readonly epoch: number;
	readonly retired: boolean;
	readonly observers: Set<SignalObserver>;
	readonly seedable: boolean;
	beginAdoption(seed: ScopeSeed): AdoptionFrame;
	serializeRead(
		node: ScopedNode,
		read: SignalReadMode,
	): readonly NativeSerializedScope[] | undefined;
	trace(type: SignalTraceEvent['type'], node?: ScopedNode): void;
}

export type SignalReadMode = 'value' | 'latest' | 'snapshot';

// The public system declarations expose an ambient const enum, which cannot
// be imported as a value with verbatimModuleSyntax. Keep its ABI literals
// checked against every upstream enum member instead of relying on TS emit
// to inline them or importing a private Alien module.
const ReactiveFlags = {
	None: 0,
	Mutable: 1,
	Watching: 2,
	RecursedCheck: 4,
	Recursed: 8,
	Dirty: 16,
	Pending: 32,
} as const satisfies { [K in keyof typeof AlienReactiveFlags]: (typeof AlienReactiveFlags)[K] };
type ReactiveFlags = AlienReactiveFlags;

export interface NodeState<T = unknown> {
	readonly snapshot: SignalSnapshot<T>;
	readonly waiting?: PromiseLike<unknown>;
	readonly resolveWaiting?: () => void;
	/** Foreign lifetimes sampled by this result, independent of its current dependencies. */
	readonly owners?: ReadonlySet<GraphOwner>;
}

interface Wakeup {
	readonly promise: Promise<void>;
	resolve(): void;
}

type Work = ScopedNode | SignalObserver | (() => void);

let activeNode: ScopedNode | undefined;
let activeOwners: Set<GraphOwner> | undefined;
let trackingCycle = 0;
let executionDepth = 0;
let pureDepth = 0;
let batchDepth = 0;
let flushing = false;
let retirementError: ScopeDisposedError | undefined;
let historicalReader:
	((node: ScopedNode, read: SignalReadMode) => NodeState | undefined) | undefined;
const queued = new Set<Work>();
const noActivity = {};
const retainedOwners = new WeakMap<ScopedNode, ReadonlySet<GraphOwner>>();
const retainedNodes = new WeakMap<GraphOwner, Set<ScopedNode>>();

const graph = createReactiveSystem({
	update(node) {
		return evaluate(node as ScopedNode);
	},
	notify(node) {
		if (node instanceof ScopedNode) {
			node.revision++;
			node.wakeup?.resolve();
			node.wakeup = undefined;
			if (retirementError) {
				releaseRetention(node);
				node.state?.resolveWaiting?.();
				node.state = errorState(retirementError);
				node.flags |= ReactiveFlags.Dirty;
			}
			node.owner.trace('invalidate', node);
			if (node.kind === 'async') queued.add(node);
		} else {
			queued.add(node as SignalObserver);
		}
	},
	// A data scope owns producers, independently of UI subscription count. Keeping
	// these edges also makes dormant compiler witnesses valid without evaluating a
	// user computation from getVersion(). Scope retirement unlinks both directions.
	unwatched() {},
});

export function isThenable(value: unknown): value is PromiseLike<unknown> {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as PromiseLike<unknown>).then === 'function'
	);
}

export function assertWritable(): void {
	if (pureDepth || isNativeWriteGuarded()) throw new SignalWriteError();
}

export function setHistoricalReader(
	read: ((node: ScopedNode, read: SignalReadMode) => NodeState | undefined) | undefined,
): typeof read {
	const previous = historicalReader;
	historicalReader = read;
	return previous;
}

export function pure<T>(read: () => T): T {
	pureDepth++;
	try {
		return read();
	} finally {
		pureDepth--;
	}
}

/** Untracking never relaxes the separate computation/render write guard. */
export function untrack<T>(run: () => T): T {
	const previousNode = activeNode;
	const previousObserver = setNativeReadObserver(null);
	activeNode = undefined;
	try {
		return run();
	} finally {
		activeNode = previousNode;
		setNativeReadObserver(previousObserver);
	}
}

export function startSignalBatch(): void {
	batchDepth++;
}

export function endSignalBatch(): void {
	if (--batchDepth === 0) flush();
}

export function signalBatch<T>(run: () => T): T {
	startSignalBatch();
	try {
		return run();
	} finally {
		endSignalBatch();
	}
}

function flush(): void {
	if (flushing) return;
	flushing = true;
	let firstError: unknown;
	let failed = false;
	try {
		for (const work of queued) {
			queued.delete(work);
			try {
				if (typeof work === 'function') {
					untrack(work);
				} else if (work instanceof ScopedNode) {
					if (!work.owner.retired) refreshNode(work);
				} else {
					runObserver(work);
				}
			} catch (error) {
				if (!failed) firstError = error;
				failed = true;
			}
		}
	} finally {
		flushing = false;
	}
	if (failed) throw firstError;
}

export function readyState<T>(
	value: T,
	activity: {
		refreshing?: boolean;
		connection?: ConnectionState;
		complete?: boolean;
		requestKey?: string;
	} = noActivity,
): NodeState<T> {
	return {
		snapshot: {
			status: 'ready',
			value,
			refreshing: activity.refreshing ?? false,
			connection: activity.connection ?? 'none',
			complete: activity.complete ?? true,
			...(activity.requestKey === undefined ? {} : { requestKey: activity.requestKey }),
		},
	};
}

export function errorState(
	error: unknown,
	connection: ConnectionState = 'none',
	requestKey?: string,
): NodeState<never> {
	return {
		snapshot: {
			status: 'error',
			error,
			refreshing: false,
			connection,
			complete: false,
			...(requestKey === undefined ? {} : { requestKey }),
		},
	};
}

export function pendingState(
	waiting: PromiseLike<unknown>,
	connection: ConnectionState = 'none',
	requestKey?: string,
	resolveWaiting?: () => void,
): NodeState<never> {
	return {
		snapshot: {
			status: 'pending',
			refreshing: false,
			connection,
			complete: false,
			...(requestKey === undefined ? {} : { requestKey }),
		},
		waiting,
		...(resolveWaiting ? { resolveWaiting } : {}),
	};
}

function sameOwners(a: NodeState, b: NodeState): boolean {
	if (a.owners === b.owners) return true;
	if ((a.owners?.size ?? 0) !== (b.owners?.size ?? 0)) return false;
	if (a.owners) for (const owner of a.owners) if (!b.owners?.has(owner)) return false;
	return true;
}

export function sameState(a: NodeState | undefined, b: NodeState): boolean {
	if (!a) return false;
	const left = a.snapshot;
	const right = b.snapshot;
	if (
		left.status !== right.status ||
		left.refreshing !== right.refreshing ||
		left.connection !== right.connection ||
		left.complete !== right.complete ||
		left.requestKey !== right.requestKey
	) {
		return false;
	}
	if (left.status === 'ready' && right.status === 'ready') {
		return Object.is(left.value, right.value) && sameOwners(a, b);
	}
	if (left.status === 'error' && right.status === 'error') {
		return Object.is(left.error, right.error) && sameOwners(a, b);
	}
	return a.waiting === b.waiting && sameOwners(a, b);
}

function withOwners<T>(
	state: NodeState<T>,
	owners: ReadonlySet<GraphOwner> | undefined,
): NodeState<T> {
	return owners?.size ? { ...state, owners } : state;
}

function recordOwners(node: ScopedNode, state: NodeState): void {
	const consumer = activeNode;
	if (!consumer) return;
	if (node.owner !== consumer.owner) (activeOwners ??= new Set()).add(node.owner);
	if (state.owners) {
		for (const owner of state.owners) {
			if (owner !== consumer.owner) (activeOwners ??= new Set()).add(owner);
		}
	}
}

function releaseRetainedOwners(node: ScopedNode): void {
	const owners = retainedOwners.get(node);
	if (!owners) return;
	retainedOwners.delete(node);
	for (const owner of owners) {
		const nodes = retainedNodes.get(owner);
		nodes?.delete(node);
		if (!nodes?.size) retainedNodes.delete(owner);
	}
}

export function releaseRetention(node: ScopedNode): void {
	if (node.lastState?.owners) releaseRetainedOwners(node);
	node.last = undefined;
	node.lastState = undefined;
	node.hasLast = false;
}

function retainOwners(node: ScopedNode): void {
	const owners = node.lastState?.owners;
	if (!owners || retainedOwners.get(node) === owners) return;
	releaseRetainedOwners(node);
	retainedOwners.set(node, owners);
	for (const owner of owners) {
		let nodes = retainedNodes.get(owner);
		if (!nodes) retainedNodes.set(owner, (nodes = new Set()));
		nodes.add(node);
	}
}

function revokeRetainedValues(owner: GraphOwner, error: ScopeDisposedError): void {
	const nodes = retainedNodes.get(owner);
	if (!nodes) return;
	for (const node of nodes) {
		const origins = node.state?.owners;
		let surviving: Set<GraphOwner> | undefined;
		if (origins) {
			for (const origin of origins) {
				if (!origin.retired) (surviving ??= new Set()).add(origin);
			}
		}
		commitState(node, withOwners(errorState(error), surviving));
		if (node.subs) {
			graph.propagate(node.subs, executionDepth !== 0);
			graph.shallowPropagate(node.subs);
		}
	}
	retainedNodes.delete(owner);
}

function createWakeup(): Wakeup {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

export class ScopedNode<T = any> implements SignalHandle<T>, ReactiveNode {
	declare readonly [SIGNAL_HANDLE]: T;
	deps: ReactiveNode['deps'];
	depsTail: ReactiveNode['depsTail'];
	subs: ReactiveNode['subs'];
	subsTail: ReactiveNode['subsTail'];
	flags: ReactiveFlags;
	revision = 0;
	state: NodeState<T> | undefined;
	compute: (() => NodeState<T>) | undefined;
	last: T | undefined;
	lastState: NodeState<T> | undefined;
	hasLast = false;
	evaluating = false;
	wakeup: Wakeup | undefined;
	nativeSource: NativeReadSource | undefined;
	nativeLatestSource: NativeReadSource | undefined;
	nativeSnapshotSource: NativeReadSource | undefined;
	retry(_options?: { pending?: boolean }): void {
		assertAlive(this.owner);
		throw new TypeError('Only an async signal can be retried.');
	}

	constructor(
		readonly owner: GraphOwner,
		readonly key: string,
		readonly kind: 'signal' | 'derived' | 'async',
	) {
		this.flags = ReactiveFlags.Mutable | ReactiveFlags.Watching | ReactiveFlags.Dirty;
	}

	get(): T {
		return strictValue(readNode(this));
	}

	set(value: T | ((previous: T) => T)): void {
		assertAlive(this.owner);
		assertWritable();
		if (this.kind !== 'signal') throw new TypeError('Only a writable signal accepts set().');
		signalBatch(() => {
			const previous = strictValue(refreshNode(this));
			const next =
				typeof value === 'function'
					? untrack(() => pure(() => (value as (previous: T) => T)(previous)))
					: value;
			if (Object.is(previous, next)) return;
			publishNode(this, readyState(next));
			this.owner.trace('write', this);
		});
	}

	latest(): T | undefined;
	latest<F>(fallback: F): T | F;
	latest<F>(fallback?: F): T | F | undefined {
		const state = readNode(this, 'latest');
		if (state.snapshot.status === 'ready') return state.snapshot.value;
		if (
			state.snapshot.status === 'error' &&
			(state.snapshot.error instanceof ScopeDisposedError ||
				state.snapshot.error instanceof SignalFrameError ||
				state.snapshot.error instanceof NativeAdoptionMiss)
		) {
			throw state.snapshot.error;
		}
		return fallback;
	}

	snapshot(): SignalSnapshot<T> {
		// Internal state is replaced, never mutated. Freeze only when exposed;
		// ordinary value reads and dependency checks need no public snapshot work.
		return Object.freeze(readNode(this, 'snapshot').snapshot);
	}

	subscribe(notify: () => void): () => void {
		assertAlive(this.owner);
		assertWritable();
		if (typeof notify !== 'function')
			throw new TypeError('A signal subscriber must be a function.');
		const state = untrack(() => refreshNode(this));
		return attachObserver(this, notify, false, state);
	}
}

export function assertAlive(owner: GraphOwner): void {
	if (owner.retired) throw new ScopeDisposedError(owner.scopeKey);
}

/** Inspect only cached metadata; never refresh a dormant or invalidated node. */
export function inspectNativeNode(node: ScopedNode, read: SignalReadMode): NativeReadInspection {
	const dependencies: { scopeKey: string; key: string }[] = [];
	for (let link = node.deps; link; link = link.nextDep) {
		if (link.dep instanceof ScopedNode) {
			dependencies.push({ scopeKey: link.dep.owner.scopeKey, key: link.dep.key });
		}
	}
	return {
		scopeKey: node.owner.scopeKey,
		key: node.key,
		read,
		kind: node.kind,
		status: node.state?.snapshot.status ?? 'unevaluated',
		revision: node.revision,
		epoch: node.owner.epoch,
		retired: node.owner.retired,
		historical: false,
		retained: node.hasLast,
		refreshing: node.state?.snapshot.refreshing ?? false,
		connection: node.state?.snapshot.connection ?? 'none',
		complete: node.state?.snapshot.complete ?? false,
		dependencies,
	};
}

export function readNode<T>(node: ScopedNode<T>, read: SignalReadMode = 'value'): NodeState<T> {
	assertAlive(node.owner);
	const historical = historicalReader?.(node, read) as NodeState<T> | undefined;
	if (historical) return historical;
	if (!historicalReader && node.owner.seedable) {
		const frame = getNativeAdoptionResolver()?.(node.owner);
		if (frame) return frame.run(() => readNode(node, read));
	}
	const state = refreshNode(node);
	const observed =
		read === 'latest' && state.snapshot.status !== 'ready' ? (node.lastState ?? state) : state;
	if (activeNode) graph.link(node, activeNode, trackingCycle);
	if (getNativeReadObserver()) {
		const field =
			read === 'value'
				? 'nativeSource'
				: read === 'latest'
					? 'nativeLatestSource'
					: 'nativeSnapshotSource';
		const source = (node[field] ??= {
			getVersion: () => node.revision,
			subscribe: (notify) => {
				assertAlive(node.owner);
				return attachObserver(node, notify, true);
			},
			serialize: (revision) =>
				node.revision === revision ? node.owner.serializeRead(node, read) : undefined,
			inspect: () => inspectNativeNode(node, read),
		});
		reportNativeRead(source, node.revision);
	}
	// Retirement marks the owner before invoking user cancellation callbacks.
	// A reentrant read must not expose its old value before graph teardown runs.
	if (observed.owners) for (const owner of observed.owners) assertAlive(owner);
	if (activeNode) recordOwners(node, observed);
	return observed;
}

export function strictValue<T>(state: NodeState<T>): T {
	const snapshot = state.snapshot;
	if (snapshot.status === 'ready') return snapshot.value;
	if (snapshot.status === 'error') throw snapshot.error;
	throw state.waiting;
}

export function refreshNode<T>(node: ScopedNode<T>): NodeState<T> {
	assertAlive(node.owner);
	if (node.evaluating) throw new SignalCycleError(node.key);
	// Dirty dependency checks may execute an async description and its loader
	// before derivedState runs. They belong to the same pure read boundary as
	// the computation, including when this derived value was previously cached.
	const guarded = node.kind === 'derived';
	if (guarded) pureDepth++;
	try {
		let iterations = 0;
		while (true) {
			const flags = node.flags;
			if (
				flags & ReactiveFlags.Dirty ||
				(flags & ReactiveFlags.Pending && (!node.deps || graph.checkDirty(node.deps, node)))
			) {
				if (++iterations > 100) throw new SignalCycleError(node.key);
				if (evaluate(node) && node.subs) graph.shallowPropagate(node.subs);
				if (node.flags & (ReactiveFlags.Dirty | ReactiveFlags.Pending)) continue;
			} else {
				node.flags &= ~ReactiveFlags.Pending;
			}
			node.flags &= ~ReactiveFlags.Recursed;
			break;
		}
		return node.state!;
	} finally {
		if (guarded) pureDepth--;
	}
}

function evaluate(node: ScopedNode): boolean {
	if (!node.compute) {
		node.flags = ReactiveFlags.Mutable | ReactiveFlags.Watching;
		return true;
	}
	const previousNode = activeNode;
	const previousOwners = activeOwners;
	const previousObserver = setNativeReadObserver(null);
	node.depsTail = undefined;
	node.flags = ReactiveFlags.Mutable | ReactiveFlags.Watching | ReactiveFlags.RecursedCheck;
	node.evaluating = true;
	activeNode = node;
	activeOwners = undefined;
	trackingCycle++;
	executionDepth++;
	let next: NodeState;
	let owners: Set<GraphOwner> | undefined;
	try {
		next = node.compute();
	} catch (error) {
		if (isThenable(error)) {
			const wakeup = (node.wakeup ??= createWakeup());
			// The waiting promise retains only its tiny wakeup, not the node or owner.
			Promise.resolve(error).then(wakeup.resolve, wakeup.resolve);
			next = pendingState(wakeup.promise);
		} else {
			next = errorState(error);
		}
	} finally {
		executionDepth--;
		owners = activeOwners;
		activeOwners = previousOwners;
		activeNode = previousNode;
		setNativeReadObserver(previousObserver);
		node.evaluating = false;
		node.flags &= ~ReactiveFlags.RecursedCheck;
		const tail = (node as ReactiveNode).depsTail;
		let obsolete = tail ? tail.nextDep : node.deps;
		while (obsolete) obsolete = graph.unlink(obsolete, node);
	}
	next = withOwners(next, owners);
	// A pending/error branch cannot make a revoked retained value usable again.
	// A complete new computation can replace it and establish new provenance.
	if (
		next.snapshot.status !== 'ready' &&
		node.state?.snapshot.status === 'error' &&
		node.state.snapshot.error instanceof ScopeDisposedError
	) {
		next = withOwners(errorState(node.state.snapshot.error), next.owners);
	}
	if (sameState(node.state, next)) return false;
	commitState(node, next);
	return true;
}

function commitState<T>(node: ScopedNode<T>, next: NodeState<T>): void {
	const previous = node.state;
	node.state = next;
	node.revision++;
	if (next.snapshot.status === 'ready') {
		if (previous?.snapshot.status !== 'ready' && node.lastState?.owners)
			releaseRetainedOwners(node);
		node.last = next.snapshot.value;
		node.lastState = next;
		node.hasLast = true;
	} else if (
		next.snapshot.status === 'error' &&
		(next.snapshot.error instanceof ScopeDisposedError ||
			next.snapshot.error instanceof SignalFrameError ||
			next.snapshot.error instanceof NativeAdoptionMiss)
	) {
		releaseRetention(node);
	} else if (node.lastState?.owners) {
		retainOwners(node);
	}
	if (next.snapshot.status !== 'pending') {
		previous?.resolveWaiting?.();
		node.wakeup?.resolve();
		node.wakeup = undefined;
	}
}

export function publishNode<T>(node: ScopedNode<T>, next: NodeState<T>): void {
	if (node.kind === 'async' && node.state?.owners) next = withOwners(next, node.state.owners);
	if (sameState(node.state, next)) return;
	commitState(node, next);
	if (node.subs) {
		graph.propagate(node.subs, executionDepth !== 0);
		graph.shallowPropagate(node.subs);
	}
}

/** An explicit source retry invalidates even a cached description failure. */
export function invalidateNode(node: ScopedNode): void {
	node.flags |= ReactiveFlags.Dirty;
	node.revision++;
	node.wakeup?.resolve();
	node.wakeup = undefined;
	if (node.subs) graph.propagate(node.subs, executionDepth !== 0);
}

export function derivedState<T>(node: ScopedNode<T>, read: () => T): NodeState<T> {
	const value = pure(read);
	if (isThenable(value)) throw new TypeError('derived$ requires a synchronous computation.');
	let refreshing = false;
	let complete = true;
	let connection: ConnectionState = 'none';
	for (let link = node.deps; link && node.depsTail; link = link.nextDep) {
		const dependency = (link.dep as ScopedNode).state?.snapshot;
		if (dependency) {
			refreshing ||= dependency.refreshing;
			complete &&= dependency.complete;
			if (dependency.connection === 'open') connection = 'open';
			else if (connection !== 'open' && dependency.connection === 'connecting')
				connection = 'connecting';
			else if (connection === 'none' && dependency.connection === 'closed') connection = 'closed';
		}
		if (link === node.depsTail) break;
	}
	return readyState(value, { refreshing, complete, connection });
}

export class SignalObserver implements ReactiveNode {
	deps: ReactiveNode['deps'];
	depsTail: ReactiveNode['depsTail'];
	flags: ReactiveFlags = ReactiveFlags.Watching;

	constructor(
		public node: ScopedNode | undefined,
		public notify: (() => void) | undefined,
		readonly native: boolean,
		public previous: NodeState | undefined,
	) {}
}

function attachObserver(
	node: ScopedNode,
	notify: () => void,
	native: boolean,
	state?: NodeState,
): () => void {
	const observer = new SignalObserver(node, notify, native, state);
	graph.link(node, observer, ++trackingCycle);
	node.owner.observers.add(observer);
	return () => stopObserver(observer);
}

function runObserver(observer: SignalObserver): void {
	const node = observer.node;
	if (!node || !observer.flags) return;
	observer.flags = ReactiveFlags.Watching;
	if (!observer.native) {
		const state = untrack(() => refreshNode(node));
		if (sameState(observer.previous, state)) return;
		observer.previous = state;
	}
	if (observer.notify) untrack(observer.notify);
}

export function stopObserver(observer: SignalObserver): void {
	if (!observer.node) return;
	queued.delete(observer);
	observer.flags = ReactiveFlags.None;
	observer.node.owner.observers.delete(observer);
	observer.node = undefined;
	observer.notify = undefined;
	observer.previous = undefined;
	while (observer.deps) graph.unlink(observer.deps, observer);
}

export function retireGraph(owner: GraphOwner, nodes: Iterable<ScopedNode>): void {
	const previousError = retirementError;
	retirementError = new ScopeDisposedError(owner.scopeKey);
	try {
		for (const observer of owner.observers) {
			// Public subscriptions end silently. Native views must invalidate once so
			// a mounted consumer cannot keep displaying a retired owner's values.
			if (observer.native && observer.notify) queued.add(observer.notify);
			stopObserver(observer);
		}
		revokeRetainedValues(owner, retirementError);
		for (const node of nodes) {
			queued.delete(node);
			node.wakeup?.resolve();
			node.wakeup = undefined;
			node.revision++;
			node.state?.resolveWaiting?.();
			node.state = errorState(retirementError);
			releaseRetention(node);
			node.compute = undefined;
			if (node.kind === 'async') node.retry = ScopedNode.prototype.retry;
			if (node.subs) {
				graph.propagate(node.subs, executionDepth !== 0);
				graph.shallowPropagate(node.subs);
			}
			while (node.deps) graph.unlink(node.deps, node);
			while (node.subs) graph.unlink(node.subs);
			node.flags = ReactiveFlags.None;
		}
	} finally {
		retirementError = previousError;
	}
}
