import { formatClientError } from '../error-codes.client.generated.js';
import {
	candidateHooks,
	pendingSignals,
	pendingWorld,
	registerGraphBridge,
	withCommittedSignals,
	type CandidateContext,
	type PendingSlotLike,
} from './transition-state.js';
import { installSignalActions } from '#octane/signal-actions/graph';
import { installServerReads } from '#octane/signals/server-reads';
import {
	assertAlive,
	ScopeDisposedError,
	SignalCycleError,
	SignalFrameError,
	SignalIdleError,
	SignalWriteError,
} from './errors.js';
export { assertAlive } from './errors.js';
import {
	REACTIVE_DIRTY,
	REACTIVE_MUTABLE,
	REACTIVE_NONE,
	REACTIVE_PENDING,
	REACTIVE_RECURSED,
	REACTIVE_RECURSED_CHECK,
	REACTIVE_WATCHING,
} from './graph-flags.js';
import {
	NATIVE_DOM_VALUE,
	forwardNativeTransitionConsumer,
	getNativeReadObserver,
	getNativeAdoptionResolver,
	isNativeAdoptionMiss,
	isNativeWriteGuarded,
	nativeReadSerializer,
	reportNativeRead,
	setNativeAdoptionResolver,
	setNativeReadObserver,
	type NativeReadInspection,
	type NativeReadSource,
	type NativeSerializedScope,
} from './read-protocol.js';
import {
	SIGNAL_BINDING_READ,
	SIGNAL_BINDING_SUBSCRIBE,
	SIGNAL_BINDING_RETIRED,
	SIGNAL_BINDING_IDENTITY,
	SIGNAL_HANDLE,
	type AdoptionFrame,
	type ConnectionState,
	type ScopeSeed,
	type SignalHandle,
	type SignalSnapshot,
	type SignalTraceEvent,
} from './types.js';

export interface GraphOwner {
	readonly scopeKey: string;
	readonly epoch: number;
	readonly retired: boolean;
	/** Optional document freeze barrier; ordinary owners never allocate one. */
	readonly readBarrier?: Promise<void> | undefined;
	readonly observers: Set<SignalObserver>;
	readonly seedable: boolean;
	/** Holds a writable or asynchronous derived cell that new render inputs cannot re-select. */
	unkeyedState?: boolean;
	beginAdoption(seed: ScopeSeed): AdoptionFrame;
	trace(type: SignalTraceEvent['type'], node?: ScopedNode): void;
}

export interface CandidateProducer {
	dispose(): void;
	/** Rebind work to a later accepted declaration before its next evaluation. */
	refreshDeclaration?(): void;
	/** Explicit async reads complement the synchronous graph edges. */
	dependencies?(): Iterable<ScopedNode>;
	prepare():
		| { status: 'ready'; receipt: CandidateProducerReceipt }
		| { status: 'pending'; waiting: PromiseLike<unknown> }
		| { status: 'error'; error: unknown }
		| { status: 'invalid' };
}

export interface CandidateProducerReceipt {
	validate(): boolean;
	publish(): () => void;
	/** Canonical revisions are installed; transfer leases without evaluating readers. */
	accept?(): void;
}

export { CandidateUnsupportedError } from './transition-state.js';
export type { CandidateContext } from './transition-state.js';

export type SignalReadMode = 'value' | 'latest' | 'snapshot';

declare const __OCTANE_PROFILE_ENABLED__: boolean;

// Dependency graph algorithms adapted from Alien Signals 3.2.1 (MIT), Johnson Chu.
// Upstream: stackblitz/alien-signals@8734d386d925025d0e99419bd9161c17b112c5ee, src/system.ts.
// The package LICENSE includes the upstream copyright and permission notice.
interface ReactiveNode {
	deps?: Link | undefined;
	depsTail?: Link | undefined;
	subs?: Link | undefined;
	subsTail?: Link | undefined;
	flags: ReactiveFlags;
}

interface Link {
	version: number;
	dep: ReactiveNode;
	sub: ReactiveNode;
	prevSub: Link | undefined;
	nextSub: Link | undefined;
	prevDep: Link | undefined;
	nextDep: Link | undefined;
}

interface Stack<T> {
	value: T;
	prev: Stack<T> | undefined;
}

type ReactiveFlags = number;

export interface NodeState<T = unknown> {
	readonly snapshot: SignalSnapshot<T>;
	readonly waiting?: PromiseLike<unknown> | undefined;
	readonly resolveWaiting?: () => void;
	/** Foreign lifetimes sampled by this result, independent of its current dependencies. */
	readonly owners?: ReadonlySet<GraphOwner>;
}

interface Wakeup {
	readonly promise: Promise<void>;
	settled: boolean;
	resolve(): void;
	/** The thenable the latest evaluation threw, if one did. */
	thrown?: object;
	/** The node waiting on that thenable, held only until the wait ends. */
	node?: ScopedNode | undefined;
}

type Work = ScopedNode | SignalObserver | (() => void);

let activeNode: ScopedNode | undefined;
let activeOwners: Set<GraphOwner> | undefined;
let trackingCycle = 0;
let executionDepth = 0;
let pureDepth = 0;
let batchDepth = 0;
let flushing = false;
/** While an owner retires: the one error state its nodes and their dependents present. */
let retirement: NodeState<never> | undefined;
let historicalReader:
	((node: ScopedNode, read: SignalReadMode) => NodeState | undefined) | undefined;
const queued = new Set<Work>();
const settledThrown = new WeakSet<object>();
const noActivity = {};
const retainedOwners = new WeakMap<ScopedNode, ReadonlySet<GraphOwner>>();
const retainedNodes = new WeakMap<GraphOwner, Set<ScopedNode>>();

function notifyNode(node: ReactiveNode): void {
	if (node instanceof ScopedNode) {
		node.revision++;
		node.wakeup?.resolve();
		node.wakeup = undefined;
		if (retirement) retireState(node);
		node.owner.trace('invalidate', node);
		if (node.invalidateAttempt) {
			if (candidateHooks.defer) {
				const invalidate = node.invalidateAttempt;
				queued.add(() => {
					// An accepted read can already have replaced this producer.
					if (node.invalidateAttempt === invalidate) invalidate();
				});
			} else node.invalidateAttempt();
			queued.add(node);
		} else if (node.kind === 'async') queued.add(node);
	} else {
		queued.add(node as SignalObserver);
	}
}

export interface SignalGraph {
	unlink: typeof unlink;
	propagate: typeof propagate;
	shallowPropagate: typeof shallowPropagate;
}

function linkDependency(dep: ReactiveNode, sub: ReactiveNode, version: number): void {
	const prevDep = sub.depsTail;
	if (prevDep !== undefined && prevDep.dep === dep) {
		return;
	}
	const nextDep = prevDep !== undefined ? prevDep.nextDep : sub.deps;
	if (nextDep !== undefined && nextDep.dep === dep) {
		nextDep.version = version;
		sub.depsTail = nextDep;
		return;
	}
	const prevSub = dep.subsTail;
	if (prevSub !== undefined && prevSub.version === version && prevSub.sub === sub) {
		return;
	}
	const newLink =
		(sub.depsTail =
		dep.subsTail =
			{
				version,
				dep,
				sub,
				prevDep,
				nextDep,
				prevSub,
				nextSub: undefined,
			});
	if (nextDep !== undefined) {
		nextDep.prevDep = newLink;
	}
	if (prevDep !== undefined) {
		prevDep.nextDep = newLink;
	} else {
		sub.deps = newLink;
	}
	if (prevSub !== undefined) {
		prevSub.nextSub = newLink;
	} else {
		dep.subs = newLink;
	}
}

function unlink(link: Link, sub = link.sub): Link | undefined {
	const { dep, prevDep, nextDep, nextSub, prevSub } = link;
	if (nextDep !== undefined) {
		nextDep.prevDep = prevDep;
	} else {
		sub.depsTail = prevDep;
	}
	if (prevDep !== undefined) {
		prevDep.nextDep = nextDep;
	} else {
		sub.deps = nextDep;
	}
	if (nextSub !== undefined) {
		nextSub.prevSub = prevSub;
	} else {
		dep.subsTail = prevSub;
	}
	if (prevSub !== undefined) {
		prevSub.nextSub = nextSub;
	} else {
		// Scopes retain their producers independently of subscriber count.
		dep.subs = nextSub;
	}
	return nextDep;
}

function propagate(link: Link, innerWrite: boolean): void {
	let next = link.nextSub;
	let stack: Stack<Link | undefined> | undefined;

	top: do {
		const sub = link.sub;
		let flags = sub.flags;

		if (
			!(flags & (REACTIVE_RECURSED_CHECK | REACTIVE_RECURSED | REACTIVE_DIRTY | REACTIVE_PENDING))
		) {
			sub.flags = flags | REACTIVE_PENDING;
			if (innerWrite) {
				sub.flags |= REACTIVE_RECURSED;
			}
		} else if (!(flags & (REACTIVE_RECURSED_CHECK | REACTIVE_RECURSED))) {
			flags = REACTIVE_NONE;
		} else if (!(flags & REACTIVE_RECURSED_CHECK)) {
			sub.flags = (flags & ~REACTIVE_RECURSED) | REACTIVE_PENDING;
		} else if (!(flags & (REACTIVE_DIRTY | REACTIVE_PENDING)) && isValidLink(link, sub)) {
			sub.flags = flags | (REACTIVE_RECURSED | REACTIVE_PENDING);
			flags &= REACTIVE_MUTABLE;
		} else {
			flags = REACTIVE_NONE;
		}

		if (flags & REACTIVE_WATCHING) {
			notifyNode(sub);
		}

		if (flags & REACTIVE_MUTABLE) {
			const subSubs = sub.subs;
			if (subSubs !== undefined) {
				const nextSub = (link = subSubs).nextSub;
				if (nextSub !== undefined) {
					stack = { value: next, prev: stack };
					next = nextSub;
				}
				continue;
			}
		}

		if ((link = next!) !== undefined) {
			next = link.nextSub;
			continue;
		}

		while (stack !== undefined) {
			link = stack.value!;
			stack = stack.prev;
			if (link !== undefined) {
				next = link.nextSub;
				continue top;
			}
		}

		break;
	} while (true);
}

function checkDirty(link: Link, sub: ReactiveNode): boolean {
	let stack: Stack<Link> | undefined;
	let checkDepth = 0;
	let dirty = false;

	top: do {
		const dep = link.dep;
		const flags = dep.flags;

		if (sub.flags & REACTIVE_DIRTY) {
			dirty = true;
		} else if (
			(flags & (REACTIVE_MUTABLE | REACTIVE_DIRTY)) ===
			(REACTIVE_MUTABLE | REACTIVE_DIRTY)
		) {
			const subs = dep.subs!;
			if (evaluate(dep as ScopedNode)) {
				if (subs.nextSub !== undefined) {
					shallowPropagate(subs);
				}
				dirty = true;
			}
		} else if (
			(flags & (REACTIVE_MUTABLE | REACTIVE_PENDING)) ===
			(REACTIVE_MUTABLE | REACTIVE_PENDING)
		) {
			stack = { value: link, prev: stack };
			link = dep.deps!;
			sub = dep;
			++checkDepth;
			continue;
		}

		if (!dirty) {
			const nextDep = link.nextDep;
			if (nextDep !== undefined) {
				link = nextDep;
				continue;
			}
		}

		while (checkDepth--) {
			link = stack!.value;
			stack = stack!.prev;
			if (dirty) {
				const subs = sub.subs!;
				if (evaluate(sub as ScopedNode)) {
					if (subs.nextSub !== undefined) {
						shallowPropagate(subs);
					}
					sub = link.sub;
					continue;
				}
				dirty = false;
			} else {
				sub.flags &= ~REACTIVE_PENDING;
			}
			sub = link.sub;
			const nextDep = link.nextDep;
			if (nextDep !== undefined) {
				link = nextDep;
				continue top;
			}
		}

		return dirty && !!sub.flags;
	} while (true);
}

function shallowPropagate(link: Link): void {
	do {
		const sub = link.sub;
		const flags = sub.flags;
		if ((flags & (REACTIVE_PENDING | REACTIVE_DIRTY)) === REACTIVE_PENDING) {
			sub.flags = flags | REACTIVE_DIRTY;
			if ((flags & (REACTIVE_WATCHING | REACTIVE_RECURSED_CHECK)) === REACTIVE_WATCHING) {
				notifyNode(sub);
			}
		}
	} while ((link = link.nextSub!) !== undefined);
}

function isValidLink(checkLink: Link, sub: ReactiveNode): boolean {
	let link = sub.depsTail;
	while (link !== undefined) {
		if (link === checkLink) {
			return true;
		}
		link = link.prevDep;
	}
	return false;
}

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

/** Cancellation callbacks observe committed state, even while a shadow evaluates. */
export function untrackCommitted<T>(run: () => T): T {
	return withCommittedSignals(() => untrack(run));
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

/**
 * Deliver the queued presentation (native) observers now, ahead of the rest of
 * the batch: a promoted transition updates its DOM bindings before any public
 * subscriber hears of it (pending.ts).
 */
function presentQueued(): void {
	let firstError: unknown;
	let failed = false;
	for (const work of queued) {
		if (!(work instanceof SignalObserver) || !work.native) continue;
		queued.delete(work);
		try {
			runObserver(work);
		} catch (error) {
			if (!failed) firstError = error;
			failed = true;
		}
	}
	if (failed) throw firstError;
}

/**
 * A subscriber the graph is still delivering can dispatch an event, whose batch
 * then closes without a flush: flush never recurses into subscribers. Before
 * that event restores a controlled field, its presentation observers run, so
 * the renders its writes caused are admitted first. Public subscribers still
 * wait for the outer flush.
 */
export function presentDuringFlush(): void {
	if (flushing && batchDepth === 0) presentQueued();
}

export function readyState<T>(
	value: T,
	activity: {
		refreshing?: boolean | undefined;
		connection?: ConnectionState | undefined;
		complete?: boolean;
		requestKey?: string | undefined;
	} = noActivity,
): NodeState<T> {
	const refreshing = activity.refreshing ?? false;
	const connection = activity.connection ?? 'none';
	const complete = activity.complete ?? true;
	const requestKey = activity.requestKey;
	return {
		snapshot:
			requestKey === undefined
				? { status: 'ready', value, refreshing, connection, complete }
				: { status: 'ready', value, refreshing, connection, complete, requestKey },
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

export function idleState(): NodeState<never> {
	return {
		snapshot: {
			status: 'idle',
			refreshing: false,
			connection: 'none',
			complete: false,
		},
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
	node.lastState = undefined;
	node.last = undefined;
	node.hasLast = false;
}

/**
 * Settle a node's waiter, then present the retirement, to be read again, and
 * retain nothing. Disposal runs this for every node, so it never builds a
 * value-only node's state only to replace it: once built, that state is plain
 * and ready, with no waiter and no owners.
 */
function retireState(node: ScopedNode): void {
	node.storedState?.resolveWaiting?.();
	node.valueOnly = false;
	node.storedState = retirement;
	node.flags |= REACTIVE_DIRTY;
	releaseRetention(node);
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

function revokeRetainedValues(owner: GraphOwner): void {
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
		commitState(node, withOwners(retirement!, surviving));
		if (node.subs) {
			propagate(node.subs, executionDepth !== 0);
			shallowPropagate(node.subs);
		}
	}
	retainedNodes.delete(owner);
}

function createWakeup(): Wakeup {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	const wakeup: Wakeup = {
		promise,
		settled: false,
		resolve() {
			wakeup.node = undefined;
			if (wakeup.settled) return;
			wakeup.settled = true;
			resolve();
		},
	};
	return wakeup;
}

/**
 * A pending read's waiting promise settles once its value may have changed, and
 * its readers then read it again. A computation's thrown thenable settling is
 * such a change, so the node waiting on it evaluates again rather than present
 * the same pending read with a waiting promise that has already settled.
 */
function settleThrown(wakeup: Wakeup, thrown: object): void {
	settledThrown.add(thrown);
	// A later evaluation waits on another thenable.
	if (wakeup.thrown !== thrown) return;
	const node = wakeup.node;
	if (node === undefined) wakeup.resolve();
	else signalBatch(() => invalidateNode(node));
}

export class ScopedNode<T = any> implements SignalHandle<T>, ReactiveNode {
	/** Recognize a native node without observing an arbitrary imported value. */
	static hasNativeBrand(value: object): value is ScopedNode {
		return #nativeSnapshotSource in value;
	}

	get [SIGNAL_HANDLE](): true {
		return true;
	}
	deps: ReactiveNode['deps'];
	depsTail: ReactiveNode['depsTail'];
	subs: ReactiveNode['subs'];
	subsTail: ReactiveNode['subsTail'];
	flags: ReactiveFlags;
	revision = 0;
	/**
	 * A node whose state is plain and ready is value-only: a writable cell, or a
	 * computation whose result has no dependency activity or foreign owners.
	 * `last` holds its value, and its current state, which is also its retained
	 * state, is the plain ready state of that value. Writes, plain results and
	 * value reads never build that state; `state` and `lastState` build it once
	 * on demand. Assigning either stores explicit states, as a pending, failed
	 * or async node holds, so assign them before changing `last`.
	 */
	valueOnly = false;
	storedState: NodeState<T> | undefined = undefined;
	storedLastState: NodeState<T> | undefined = undefined;
	compute: ((target: ScopedNode<T>) => NodeState<T>) | undefined;
	invalidateAttempt: (() => void) | undefined;
	last: T | undefined = undefined;
	hasLast = false;
	evaluating = false;
	wakeup: Wakeup | undefined;
	nativeSource: NativeReadSource | undefined;
	nativeLatestSource: NativeReadSource | undefined;
	#nativeSnapshotSource: NativeReadSource | undefined;
	/** A resource's retry. Kept in a field so an async node keeps the shared layout. */
	retryRequest: ((options?: { pending?: boolean }) => void) | undefined = undefined;
	/**
	 * The node's state inside a transition that has not committed (pending.ts),
	 * or, on that slot's private shadow node, the slot it presents.
	 */
	pending: PendingSlotLike | undefined = undefined;

	get state(): NodeState<T> | undefined {
		if (this.valueOnly && this.storedState === undefined) this.buildState();
		return this.storedState;
	}

	set state(state: NodeState<T> | undefined) {
		if (this.valueOnly) this.storeStates();
		this.storedState = state;
	}

	get lastState(): NodeState<T> | undefined {
		return this.valueOnly ? this.state : this.storedLastState;
	}

	set lastState(state: NodeState<T> | undefined) {
		if (this.valueOnly) this.storeStates();
		this.storedLastState = state;
	}

	private buildState(): void {
		this.storedState = this.storedLastState = readyState(this.last as T);
	}

	/** Leave value-only: the built states become ordinary stored states. */
	private storeStates(): void {
		if (this.storedState === undefined) this.buildState();
		this.valueOnly = false;
	}

	retry(options?: { pending?: boolean }): void {
		assertAlive(this.owner);
		if (this.retryRequest === undefined) throw new TypeError(formatClientError(163));
		this.retryRequest(options);
	}

	/** This node's native read channel for `read`, created on first use. */
	nativeReadSource(read: SignalReadMode): NativeReadSource {
		if (read === 'value') return (this.nativeSource ??= createNativeSource(this, read));
		if (read === 'latest') return (this.nativeLatestSource ??= createNativeSource(this, read));
		return (this.#nativeSnapshotSource ??= createNativeSource(this, read));
	}

	/** The existing snapshot channel, without creating one during transition cleanup. */
	get nativeSnapshotSource(): NativeReadSource | undefined {
		return this.#nativeSnapshotSource;
	}

	constructor(
		readonly owner: GraphOwner,
		readonly key: string,
		readonly kind: 'signal' | 'derived' | 'async',
	) {
		this.flags = REACTIVE_MUTABLE | REACTIVE_WATCHING | REACTIVE_DIRTY;
	}

	get(): T {
		return readValue(this);
	}

	[SIGNAL_BINDING_READ](): T {
		return readSignalBinding(this);
	}

	[SIGNAL_BINDING_SUBSCRIBE](notify: () => void, onRetire?: () => void): () => void {
		assertAlive(this.owner);
		// An optional native lease can end when its exact owner retires. A live
		// computation throwing ScopeDisposedError still uses normal invalidation.
		return attachObserver(
			this,
			onRetire === undefined
				? notify
				: forwardNativeTransitionConsumer(notify, () =>
						this.owner.retired ? onRetire() : notify(),
					),
			true,
		);
	}

	[SIGNAL_BINDING_RETIRED](): boolean {
		return this.owner.retired;
	}

	[SIGNAL_BINDING_IDENTITY]() {
		return { scope: 'instance' as const, nodeKey: this.key };
	}

	[NATIVE_DOM_VALUE](): T {
		return this.get();
	}

	set(value: T | ((previous: T) => T)): void {
		assertAlive(this.owner);
		assertWritable();
		if (this.kind !== 'signal') throw new TypeError(formatClientError(164));
		const pending = pendingSignals;
		if (pending) {
			const batch = pending.batch();
			if (batch !== null) {
				pending.write(this, value, batch);
				return;
			}
		}
		startSignalBatch();
		try {
			refresh(this);
			const previous = this.valueOnly ? (this.last as T) : strictValue(this.state!, this.key);
			const next =
				typeof value === 'function'
					? untrack(() => pure(() => (value as (previous: T) => T)(previous)))
					: value;
			if (!Object.is(previous, next)) {
				writeValue(this, next);
				this.owner.trace('write', this);
			}
			// A pending transition value re-applies the update on top, even an
			// update that leaves committed state equal.
			if (this.pending !== undefined) pending!.rebase(this, value);
		} finally {
			endSignalBatch();
		}
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
				isNativeAdoptionMiss(state.snapshot.error))
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
		if (typeof notify !== 'function') throw new TypeError(formatClientError(165));
		const state = untrack(() => refreshNode(this));
		return attachObserver(this, notify, false, state);
	}
}

// Capture these alongside the class, before a caller can replace a public
// read and later load a separately compiled hydration consumer.
export const hasScopedNodeBrand = /* @__PURE__ */ (() => ScopedNode.hasNativeBrand)();
export const originalScopedNodeGet = /* @__PURE__ */ (() => ScopedNode.prototype.get)();
export const originalScopedNodeStateGetter = /* @__PURE__ */ (() =>
	Object.getOwnPropertyDescriptor(ScopedNode.prototype, 'state')!.get)();

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

function createNativeSource(node: ScopedNode, read: SignalReadMode): NativeReadSource {
	const pending = node.pending;
	if (pending !== undefined && pending.shadow === node) return pendingSignals!.source(node, read);
	return new GraphReadSource(node, read, declarationViews?.get(node));
}

/**
 * A node's native read channel for one read mode (ScopedNode.nativeReadSource).
 * A declaration view's channel forwards to its canonical cell's once promoted,
 * so witnesses taken during the render stay valid. The view and its canonical
 * cell share one owner.
 */
class GraphReadSource implements NativeReadSource {
	/** DevTools metadata, installed on the prototype only in profiling builds. */
	declare inspect?: () => NativeReadInspection;

	constructor(
		readonly node: ScopedNode,
		readonly read: SignalReadMode,
		readonly view: DeclarationView | undefined,
	) {}

	/** The promoted view's canonical channel, or undefined while this one is live. */
	canonicalSource(): NativeReadSource | undefined {
		const view = this.view;
		return view?.promoted ? view.canonical.nativeReadSource(this.read) : undefined;
	}

	getVersion(): number {
		const view = this.view;
		if (view !== undefined) {
			const canonical = this.canonicalSource();
			if (canonical)
				return canonical.getVersion() === view.canonicalRevision ? view.viewRevision : NaN;
			if (view.retired) return NaN;
		}
		const node = this.node;
		// A render that reads the node's pending state cannot reuse a committed read.
		return pendingWorld && pendingWorld.hides(node) ? NaN : node.revision;
	}

	subscribe(notify: () => void): () => void {
		const canonical = this.canonicalSource();
		if (canonical) return canonical.subscribe(notify);
		assertAlive(this.node.owner);
		return attachObserver(this.node, notify, true);
	}

	serialize(revision: number): readonly NativeSerializedScope[] | undefined {
		const canonical = this.canonicalSource();
		if (canonical)
			return revision === this.view!.viewRevision
				? canonical.serialize?.(this.view!.canonicalRevision)
				: undefined;
		const node = this.node;
		return node.revision === revision ? nativeReadSerializer!(node, this.read) : undefined;
	}

	retired(): boolean {
		return this.node.owner.retired;
	}
}

if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
	GraphReadSource.prototype.inspect = function (this: GraphReadSource) {
		return this.canonicalSource()?.inspect!() ?? inspectNativeNode(this.node, this.read);
	};

export function readNode<T>(node: ScopedNode<T>, read: SignalReadMode = 'value'): NodeState<T> {
	assertAlive(node.owner);
	const historical = historicalReader?.(node, read) as NodeState<T> | undefined;
	if (historical) return historical;
	if (!historicalReader && node.owner.seedable) {
		const frame = getNativeAdoptionResolver()?.(node.owner);
		if (frame) return frame.run(() => readNode(node, read));
	}
	if (pendingWorld) node = pendingWorld.resolve(node);
	refresh(node);
	return observeRead(node, read);
}

/** readNode after its node is current: track the read and present its state. */
function observeRead<T>(node: ScopedNode<T>, read: SignalReadMode): NodeState<T> {
	const state = node.state!;
	const observed =
		read === 'latest' && state.snapshot.status !== 'ready' ? (node.lastState ?? state) : state;
	trackRead(node, read);
	// Retirement marks the owner before invoking user cancellation callbacks.
	// A reentrant read must not expose its old value before graph teardown runs.
	if (observed.owners) for (const owner of observed.owners) assertAlive(owner);
	if (activeNode) recordOwners(node, observed);
	return observed;
}

function trackRead(node: ScopedNode, read: SignalReadMode): void {
	if (activeNode) linkDependency(node, activeNode, trackingCycle);
	if (getNativeReadObserver()) reportNativeRead(node.nativeReadSource(read), node.revision);
}

/**
 * strictValue(readNode(node), node.key) that never builds a value-only node's
 * state. Pending, historical and adoption reads take readNode itself.
 */
function readValue<T>(node: ScopedNode<T>): T {
	if (pendingWorld || historicalReader || (node.owner.seedable && getNativeAdoptionResolver()))
		return strictValue(readNode(node), node.key);
	refresh(node);
	if (!node.valueOnly) return strictValue(observeRead(node, 'value'), node.key);
	trackRead(node, 'value');
	// A plain ready state carries no owners of its own.
	if (activeNode && node.owner !== activeNode.owner) (activeOwners ??= new Set()).add(node.owner);
	return node.last as T;
}

/** A new writable cell's initial value, retained as its latest value too. */
export function initializeValue<T>(node: ScopedNode<T>, value: T): void {
	node.valueOnly = true;
	node.last = value;
	node.hasLast = true;
}

/** commitState(node, readyState(value)) for a value-only node: no state to settle. */
function storeValue(node: ScopedNode, value: unknown): void {
	node.last = value;
	node.storedState = node.storedLastState = undefined;
	node.revision++;
}

/** After committing a plain ready state, keep only its value. */
function dropStates(node: ScopedNode): void {
	node.valueOnly = true;
	node.storedState = node.storedLastState = undefined;
}

/** publishNode(node, readyState(value)) for a writable cell, which stays value-only. */
function writeValue<T>(node: ScopedNode<T>, value: T): void {
	if (!node.valueOnly) {
		publishNode(node, readyState(value));
		dropStates(node);
		return;
	}
	storeValue(node, value);
	if (node.subs) {
		propagate(node.subs, executionDepth !== 0);
		shallowPropagate(node.subs);
	}
}

export function strictValue<T>(state: NodeState<T>, key = 'idle'): T {
	const snapshot = state.snapshot;
	if (snapshot.status === 'ready') return snapshot.value;
	if (snapshot.status === 'error') throw snapshot.error;
	if (snapshot.status === 'idle') throw new SignalIdleError(key);
	throw state.waiting;
}

/** Set while a targeted binding, not a render, reads a historical value. */
export let historicalBindingRead = false;

/** Track historical lease release, but keep live binding reads out of the broad collector. */
export function readSignalBinding<T>(handle$: SignalHandle<T>): T {
	const resolveAdoption = getNativeAdoptionResolver();
	if (
		(historicalReader || resolveAdoption) &&
		handle$ instanceof ScopedNode &&
		handle$.owner.seedable &&
		(historicalReader || resolveAdoption?.(handle$.owner))
	) {
		// A historical read must witness its lease ending so the renderer can
		// reconcile the adopted DOM with already-newer live state. Ordinary live
		// binding reads still subscribe only to their targeted graph node below,
		// so an unchanged release drops this read rather than moving it live.
		const previous = historicalBindingRead;
		historicalBindingRead = true;
		try {
			return handle$.get();
		} finally {
			historicalBindingRead = previous;
		}
	}
	const observer = setNativeReadObserver(null);
	try {
		return handle$.get();
	} finally {
		setNativeReadObserver(observer);
	}
}

/**
 * The live source and revision `readNode(node, read)` would report outside a
 * render, when that read presents what the ready `presented` state did: the
 * same value, and for a snapshot read the same state. Value and latest reads
 * cannot observe activity metadata. Like a committed read, this may evaluate.
 */
export function unchangedLiveRead(
	node: ScopedNode,
	read: SignalReadMode,
	presented: NodeState,
): { live: NativeReadSource; version: number } | undefined {
	if (node.owner.retired || (pendingWorld && pendingWorld.hides(node))) return undefined;
	let state = refreshNode(node);
	if (read === 'latest' && state.snapshot.status !== 'ready') state = node.lastState ?? state;
	const live = state.snapshot;
	if (
		read === 'snapshot'
			? !sameState(presented, state)
			: live.status !== 'ready' ||
				!Object.is(live.value, (presented.snapshot as { value: unknown }).value)
	)
		return undefined;
	return {
		live: node.nativeReadSource(read),
		version: node.revision,
	};
}

export function refreshNode<T>(node: ScopedNode<T>): NodeState<T> {
	refresh(node);
	return node.state!;
}

function refresh(node: ScopedNode): void {
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
				flags & REACTIVE_DIRTY ||
				(flags & REACTIVE_PENDING && (!node.deps || checkDirty(node.deps, node)))
			) {
				if (++iterations > 100) throw new SignalCycleError(node.key);
				if (evaluate(node) && node.subs) shallowPropagate(node.subs);
				if (node.flags & (REACTIVE_DIRTY | REACTIVE_PENDING)) continue;
			} else {
				node.flags &= ~REACTIVE_PENDING;
			}
			node.flags &= ~REACTIVE_RECURSED;
			break;
		}
	} finally {
		if (guarded) pureDepth--;
	}
}

function evaluate(node: ScopedNode): boolean {
	if (!node.compute) {
		node.flags = REACTIVE_MUTABLE | REACTIVE_WATCHING;
		return true;
	}
	if (historicalReader || getNativeAdoptionResolver()) return evaluateLiveNode(node);
	const pending = pendingWorld;
	const world = pending ? pending.enter(node) : undefined;
	const previousNode = activeNode;
	const previousOwners = activeOwners;
	const previousObserver = setNativeReadObserver(null);
	node.depsTail = undefined;
	node.flags = REACTIVE_MUTABLE | REACTIVE_WATCHING | REACTIVE_RECURSED_CHECK;
	node.evaluating = true;
	activeNode = node;
	activeOwners = undefined;
	trackingCycle++;
	executionDepth++;
	let next: NodeState;
	let owners: Set<GraphOwner> | undefined;
	try {
		next = node.compute(node);
	} catch (error) {
		if (isThenable(error)) {
			const wakeup =
				!node.wakeup || node.wakeup.settled ? (node.wakeup = createWakeup()) : node.wakeup;
			// The thenable retains the node only while the node waits on it.
			wakeup.node = node;
			if (wakeup.thrown !== error) {
				wakeup.thrown = error;
				// A thenable that already settled cannot report a change: rethrowing it
				// waits for a dependency instead of evaluating again on every microtask.
				if (!settledThrown.has(error)) {
					const settle = () => settleThrown(wakeup, error);
					Promise.resolve(error).then(settle, settle);
				}
			}
			next = pendingState(wakeup.promise);
		} else {
			next = errorState(error);
		}
	} finally {
		executionDepth--;
		// compute() reassigned activeOwners, which this function narrowed to undefined.
		owners = activeOwners as Set<GraphOwner> | undefined;
		activeOwners = previousOwners;
		activeNode = previousNode;
		setNativeReadObserver(previousObserver);
		node.evaluating = false;
		node.flags &= ~REACTIVE_RECURSED_CHECK;
		const tail = (node as ReactiveNode).depsTail;
		let obsolete = tail ? tail.nextDep : node.deps;
		while (obsolete) obsolete = unlink(obsolete, node);
		if (pending) pending.leave(world, node);
	}
	// Only foreign provenance keeps a plain result in a stored state.
	const plain = next === PLAIN_RESULT && !owners?.size;
	if (next === PLAIN_RESULT) {
		const value = plainValue;
		plainValue = undefined;
		// A first result, like a value-only node's, has no stored state to settle.
		if (plain && (node.valueOnly || node.storedState === undefined)) {
			if (node.valueOnly) {
				if (Object.is(node.last, value)) return false;
			} else {
				if (node.storedLastState?.owners) releaseRetainedOwners(node);
				node.valueOnly = true;
				node.hasLast = true;
			}
			storeValue(node, value);
			return true;
		}
		next = readyState(value);
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
	if (plain) dropStates(node);
	return true;
}

function evaluateLiveNode(node: ScopedNode): boolean {
	// First-use declarations can create live graph nodes while the renderer is
	// presenting a historical seed. Their computations still need live inputs
	// and dependency edges; the enclosing read retains its historical channel.
	const previousReader = setHistoricalReader(undefined);
	const previousAdoption = setNativeAdoptionResolver(null);
	try {
		return evaluate(node);
	} finally {
		setNativeAdoptionResolver(previousAdoption);
		setHistoricalReader(previousReader);
	}
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
			isNativeAdoptionMiss(next.snapshot.error))
	) {
		releaseRetention(node);
	} else if (node.lastState?.owners) {
		retainOwners(node);
	}
	if (next.snapshot.status !== 'pending') previous?.resolveWaiting?.();
	// A node waits on its wakeup only while its state presents it; a thenable it
	// threw earlier no longer decides its value. Readers of that read look again.
	if (node.wakeup && next.waiting !== node.wakeup.promise) {
		node.wakeup.resolve();
		node.wakeup = undefined;
	}
}

export function publishNode<T>(node: ScopedNode<T>, next: NodeState<T>): void {
	if (node.kind === 'async' && node.state?.owners) next = withOwners(next, node.state.owners);
	if (sameState(node.state, next)) return;
	commitState(node, next);
	if (node.subs) {
		propagate(node.subs, executionDepth !== 0);
		shallowPropagate(node.subs);
	}
}

/** An explicit source retry invalidates even a cached description failure. */
export function invalidateNode(node: ScopedNode): void {
	node.flags |= REACTIVE_DIRTY;
	node.revision++;
	node.wakeup?.resolve();
	node.wakeup = undefined;
	if (node.subs) propagate(node.subs, executionDepth !== 0);
}

/**
 * Run a redeclared definition once without subscribing anyone, reporting the
 * nodes it read. A caller whose result and reads match the committed cell can
 * adopt the definition without a private view or a second evaluation.
 */
export function readsDuring<T>(owner: GraphOwner, run: () => T): { value: T; reads: ScopedNode[] } {
	const probe = new ScopedNode(owner, '', 'derived');
	const previousNode = activeNode;
	const previousOwners = activeOwners;
	const previousObserver = setNativeReadObserver(null);
	activeNode = probe;
	activeOwners = undefined;
	trackingCycle++;
	pureDepth++;
	try {
		const value = run();
		const reads: ScopedNode[] = [];
		for (let link = probe.deps; link; link = link.nextDep) reads.push(link.dep as ScopedNode);
		return { value, reads };
	} finally {
		pureDepth--;
		activeNode = previousNode;
		activeOwners = previousOwners;
		setNativeReadObserver(previousObserver);
		while (probe.deps) unlink(probe.deps, probe);
	}
}

/** The committed cell already depends on exactly these nodes, in this order. */
export function readsMatch(node: ScopedNode, reads: readonly ScopedNode[]): boolean {
	let index = 0;
	for (let link = node.deps; link; link = link.nextDep)
		if (link.dep !== reads[index++]) return false;
	return index === reads.length;
}

/** A private node evaluated from a probe's result depends on what the probe read. */
export function linkReads(node: ScopedNode, reads: readonly ScopedNode[]): void {
	for (const dep of reads) linkDependency(dep, node, ++trackingCycle);
}

/**
 * Re-run a computation whose definition changed, relinking its dependencies.
 * Unlike invalidateNode, an unchanged result keeps its revision, so readers
 * that already presented it are not rendered again.
 */
export function reevaluateNode(node: ScopedNode): void {
	const revision = node.revision;
	node.flags |= REACTIVE_DIRTY;
	refresh(node);
	if (node.revision !== revision && node.subs) {
		propagate(node.subs, executionDepth !== 0);
		shallowPropagate(node.subs);
	}
}

export function derivedState<T>(node: ScopedNode<T>, read: () => T): NodeState<T> {
	const value = pure(read);
	if (isThenable(value)) throw new TypeError(formatClientError(166));
	return derivedResult(node, value);
}

/** Returned by a computation, through evaluate(), for a plain ready `plainValue`. */
const PLAIN_RESULT = {} as NodeState;
let plainValue: unknown;

/**
 * derivedValueState(node, value) for a computation's result, which only
 * evaluate() receives: with no dependency activity, the node stays value-only.
 */
export function derivedResult<T>(node: ScopedNode<T>, value: T): NodeState<T> {
	for (let link = node.deps; link && node.depsTail; link = link.nextDep) {
		const dep = link.dep as ScopedNode;
		const snapshot = dep.valueOnly ? undefined : dep.state?.snapshot;
		if (snapshot && (snapshot.refreshing || !snapshot.complete || snapshot.connection !== 'none'))
			return derivedValueState(node, value);
		if (link === node.depsTail) break;
	}
	plainValue = value;
	return PLAIN_RESULT as NodeState<T>;
}

export function derivedValueState<T>(
	node: ScopedNode<T>,
	value: T,
	activity?: Pick<SignalSnapshot<T>, 'refreshing' | 'complete' | 'connection'>,
	additionalDependencies?: Iterable<ScopedNode>,
): NodeState<T> {
	let refreshing = false;
	let complete = true;
	let connection: ConnectionState = 'none';
	if (activity) {
		refreshing = activity.refreshing;
		complete = activity.complete;
		connection = activity.connection;
	}
	for (let link = node.deps; link && node.depsTail; link = link.nextDep) {
		// A value-only cell is plain and ready, so it adds no activity.
		const dep = link.dep as ScopedNode;
		const dependency = dep.valueOnly ? undefined : dep.state?.snapshot;
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
	if (additionalDependencies) {
		for (const node of additionalDependencies) {
			const dependency = node.valueOnly ? undefined : node.state?.snapshot;
			if (!dependency) continue;
			refreshing ||= dependency.refreshing;
			complete &&= dependency.complete;
			if (dependency.connection === 'open') connection = 'open';
			else if (connection !== 'open' && dependency.connection === 'connecting')
				connection = 'connecting';
			else if (connection === 'none' && dependency.connection === 'closed') connection = 'closed';
		}
	}
	return readyState(value, { refreshing, complete, connection });
}

export class SignalObserver implements ReactiveNode {
	deps: ReactiveNode['deps'];
	depsTail: ReactiveNode['depsTail'];
	flags: ReactiveFlags = REACTIVE_WATCHING;

	constructor(
		public node: ScopedNode | undefined,
		public notify: (() => void) | undefined,
		readonly native: boolean,
		public previous: NodeState | undefined,
	) {}
}

export function attachObserver(
	node: ScopedNode,
	notify: () => void,
	native: boolean,
	state?: NodeState,
): () => void {
	const observer = new SignalObserver(node, notify, native, state);
	// Link last: no call follows it, so an exhausted native stack cannot leave
	// a linked observer whose stop never reached the caller.
	node.owner.observers.add(observer);
	linkDependency(node, observer, ++trackingCycle);
	return () => stopObserver(observer);
}

/** Internal attempt dependency subscription; callers already hold a graph lease. */
export function subscribeNode(node: ScopedNode, notify: () => void): () => void {
	const state = untrack(() => refreshNode(node));
	return attachObserver(node, notify, true, state);
}

function runObserver(observer: SignalObserver): void {
	const node = observer.node;
	if (!node || !observer.flags) return;
	observer.flags = REACTIVE_WATCHING;
	if (!observer.native) {
		const state = untrack(() => refreshNode(node));
		if (sameState(observer.previous, state)) return;
		observer.previous = state;
	}
	if (observer.notify) untrack(observer.notify);
}

/** A retiring owner keeps the observer in its set, which it then clears at once. */
export function stopObserver(observer: SignalObserver, retiring?: boolean): void {
	const node = observer.node;
	if (!node) return;
	queued.delete(observer);
	if (!retiring) node.owner.observers.delete(observer);
	while (observer.deps) unlink(observer.deps, observer);
	// Cleared last, so a stop the native stack interrupts can run again.
	observer.flags = REACTIVE_NONE;
	observer.node = undefined;
	observer.notify = undefined;
	observer.previous = undefined;
}

/**
 * A redeclared facade presents one render's new definition through a private
 * node in the same owner. It is not registered by key, so committed readers,
 * seeds and candidate frames never observe it. Acceptance installs its state in
 * the canonical node and moves the render's consumers there; its native sources
 * then forward, so witnesses taken during the render stay valid.
 */
interface DeclarationView {
	readonly canonical: ScopedNode;
	/** A candidate frame forks a view exactly like the cell it presents. */
	readonly fork: DeclarationViewFork;
	retired: boolean;
	promoted: boolean;
	viewRevision: number;
	canonicalRevision: number;
}

export type DeclarationViewFork = (
	target: ScopedNode,
	context: CandidateContext,
) => CandidateProducer | undefined;

let declarationViews: WeakMap<ScopedNode, DeclarationView> | undefined;

export function createDeclarationView<T>(
	canonical: ScopedNode<T>,
	fork: (target: ScopedNode<T>, context: CandidateContext) => CandidateProducer | undefined,
): ScopedNode<T> {
	const view = new ScopedNode<T>(canonical.owner, canonical.key, canonical.kind);
	// Retained values survive a changed definition, as they survive a changed selection.
	view.last = canonical.last;
	view.lastState = canonical.lastState;
	view.hasLast = canonical.hasLast;
	const record: DeclarationView = {
		canonical,
		fork: fork as DeclarationViewFork,
		retired: false,
		promoted: false,
		viewRevision: NaN,
		canonicalRevision: NaN,
	};
	// Its native sources forward once accepted; they are created on first read.
	(declarationViews ??= new WeakMap()).set(view, record);
	return view;
}

export function isDeclarationView(node: unknown): boolean {
	return declarationViews?.has(node as ScopedNode) === true;
}

/** The fork of a live view, or undefined for any other unregistered node. */
export function declarationViewFork(node: ScopedNode): DeclarationViewFork | undefined {
	const record = declarationViews?.get(node);
	return record === undefined || record.retired ? undefined : record.fork;
}

/** A promoted or released view no longer stands for its render's handle. */
export function isRetiredDeclarationView(node: unknown): boolean {
	return declarationViews?.get(node as ScopedNode)?.retired === true;
}

function retireDeclarationView(view: ScopedNode, record: DeclarationView): void {
	record.retired = true;
	if (view.pending !== undefined) pendingSignals!.drop(view.pending);
	queued.delete(view);
	// A retired view never evaluates again. Its readers still wake when the
	// thenable it threw settles, without that thenable retaining the view.
	if (view.wakeup) view.wakeup.node = undefined;
	view.compute = undefined;
	view.invalidateAttempt = undefined;
	while (view.deps) unlink(view.deps, view);
	view.flags = REACTIVE_MUTABLE | REACTIVE_WATCHING;
}

/**
 * Whether committed readers could tell the view's result from the cell's. A
 * render that redeclares a cell on every pass presents the same pending read or
 * error through a new view each time, and publishing it would render those
 * readers, and redeclare the cell, again without end. An equal result keeps the
 * cell's own snapshot instead.
 *
 * A pending view with a different waiter may keep the committed presentation
 * if its wakeup is live, the committed cell is current, and dependency order
 * and owner provenance match. The accepted view transfers its own waiter so
 * subsequent reads do not follow the displaced pending source.
 */
function sameViewResult(node: ScopedNode, view: ScopedNode, state: NodeState): boolean {
	const committed = node.state;
	if (committed === undefined) return false;
	if (sameState(committed, state)) return true;
	if (
		committed.snapshot.status !== 'pending' ||
		state.snapshot.status !== 'pending' ||
		node.flags & (REACTIVE_DIRTY | REACTIVE_PENDING) ||
		!sameState(committed, { ...state, waiting: committed.waiting })
	)
		return false;
	const previousWakeup = node.wakeup;
	const viewWakeup = view.wakeup;
	if (
		!previousWakeup ||
		!viewWakeup ||
		previousWakeup.settled ||
		viewWakeup.settled ||
		committed.waiting !== previousWakeup.promise ||
		state.waiting !== viewWakeup.promise
	)
		return false;
	let link = node.deps;
	for (let read = view.deps; read; read = read.nextDep) {
		if (link === undefined || link.dep !== read.dep) return false;
		link = link.nextDep;
	}
	return link === undefined;
}

/** The caller has already transferred producer authority from the view's binding. */
export function promoteDeclarationView(view: ScopedNode, node: ScopedNode): void {
	const record = declarationViews?.get(view);
	if (record === undefined || record.retired || record.canonical !== node) return;
	queued.delete(view);
	const state = view.state;
	// A settled view waiter cannot represent a current pending result. Re-read
	// the accepted definition before presenting it to committed consumers.
	const viewWakeup = view.wakeup;
	const settledPending =
		state?.snapshot.status === 'pending' &&
		viewWakeup !== undefined &&
		viewWakeup.promise === state.waiting &&
		viewWakeup.settled;
	// An evaluated view may also have been invalidated by one of its graph
	// dependencies before acceptance, whatever it presented; preserve that
	// evidence on the cell.
	const invalidated = state === undefined ? 0 : view.flags & (REACTIVE_DIRTY | REACTIVE_PENDING);
	const retry = Boolean(invalidated || settledPending);
	const currentChanged = state !== undefined && !sameViewResult(node, view, state);
	while (node.deps) unlink(node.deps, node);
	for (let link = view.deps; link; link = link.nextDep)
		linkDependency(link.dep, node, ++trackingCycle);
	const retainedChanged =
		node.hasLast !== view.hasLast ||
		!Object.is(node.last, view.last) ||
		(view.lastState ? !sameState(node.lastState, view.lastState) : node.lastState !== undefined);
	// Transfer the accepted view waiter and wake readers of the displaced state.
	// The cell then waits on what the view's evaluation threw.
	if (currentChanged) {
		const previousWakeup = node.wakeup;
		commitState(node, state);
		if (state.snapshot.status === 'pending' && previousWakeup?.promise !== state.waiting) {
			previousWakeup?.resolve();
			node.wakeup = view.wakeup?.promise === state.waiting ? view.wakeup : undefined;
			if (node.wakeup) {
				view.wakeup = undefined;
				node.wakeup.node = node;
			}
		}
	} else if (
		state?.snapshot.status === 'pending' &&
		node.state?.snapshot.status === 'pending' &&
		view.wakeup?.promise === state.waiting &&
		node.wakeup !== view.wakeup
	) {
		const previousWakeup = node.wakeup;
		node.state = { ...state, snapshot: node.state.snapshot };
		node.wakeup = view.wakeup;
		view.wakeup = undefined;
		if (node.wakeup) node.wakeup.node = node;
		previousWakeup?.resolve();
	}
	if (node.lastState?.owners !== view.lastState?.owners) releaseRetainedOwners(node);
	node.last = view.last;
	node.lastState = view.lastState;
	node.hasLast = view.hasLast;
	if (node.state && node.state.snapshot.status !== 'ready') retainOwners(node);
	if (!currentChanged && (retainedChanged || retry)) node.revision++;
	releaseRetainedOwners(view);
	// A view nobody read has no state to install; the cell evaluates its new definition.
	const unevaluated = state === undefined;
	node.flags =
		REACTIVE_MUTABLE |
		REACTIVE_WATCHING |
		invalidated |
		(unevaluated || settledPending ? REACTIVE_DIRTY : 0);
	// Committed consumers learn the accepted state first. The render's own
	// consumers already presented it; move them without another notification.
	if (!retry && (currentChanged || retainedChanged || unevaluated) && node.subs) {
		propagate(node.subs, executionDepth !== 0);
		shallowPropagate(node.subs);
	}
	retireDeclarationView(view, record);
	for (let link = view.subs; link;) {
		const next = link.nextSub;
		const sub = link.sub;
		unlink(link, sub);
		if (sub instanceof SignalObserver) sub.node = node;
		linkDependency(node, sub, ++trackingCycle);
		link = next;
	}
	record.promoted = true;
	record.viewRevision = view.revision;
	record.canonicalRevision = retry ? NaN : node.revision;
	// The accepted render presented an invalidated result; its moved consumers
	// must retry against the current definition as well.
	if (retry && node.subs) {
		propagate(node.subs, executionDepth !== 0);
		shallowPropagate(node.subs);
	}
}

/** Discard a view nobody accepted. Its remaining consumers belong to discarded renders. */
export function releaseDeclarationView(view: ScopedNode): void {
	const record = declarationViews?.get(view);
	if (record === undefined || record.retired) return;
	retireDeclarationView(view, record);
	let retries: (() => void)[] | undefined;
	while (view.subs) {
		const sub = view.subs.sub;
		if (sub instanceof SignalObserver) {
			if (sub.native && sub.notify) (retries ??= []).push(sub.notify);
			stopObserver(sub);
		} else unlink(view.subs, sub);
	}
	releaseRetention(view);
	// A retained retry read re-renders against the current definition. A newer
	// render usually releases the view, so notify after it rather than inside it.
	if (retries)
		queueMicrotask(() => {
			for (const retry of retries) untrack(retry);
		});
}

export function retireGraph(owner: GraphOwner, nodes: Iterable<ScopedNode>): void {
	const previous = retirement;
	retirement = errorState(new ScopeDisposedError(owner.scopeKey));
	try {
		for (const observer of owner.observers) {
			// Public subscriptions end silently. Native views must invalidate once so
			// a mounted consumer cannot keep displaying a retired owner's values.
			if (observer.native && observer.notify) queued.add(observer.notify);
			stopObserver(observer, true);
		}
		// Deleting each observer while iterating would rehash the set as it shrinks.
		owner.observers.clear();
		revokeRetainedValues(owner);
		for (const node of nodes) {
			if (node.pending !== undefined) pendingSignals!.drop(node.pending);
			queued.delete(node);
			node.wakeup?.resolve();
			node.wakeup = undefined;
			node.revision++;
			retireState(node);
			node.compute = undefined;
			node.invalidateAttempt = undefined;
			node.retryRequest = undefined;
			if (node.subs) {
				propagate(node.subs, executionDepth !== 0);
				shallowPropagate(node.subs);
			}
			while (node.deps) unlink(node.deps, node);
			while (node.subs) unlink(node.subs);
			node.flags = REACTIVE_NONE;
		}
	} finally {
		retirement = previous;
	}
}

// Optional pending code receives a runtime table; graph operations use compiled constants.
registerGraphBridge({
	ScopedNode,
	graph: { unlink, propagate, shallowPropagate },
	historical: () => historicalReader !== undefined,
	assertAlive,
	link: (from, to) => {
		linkDependency(from, to, ++trackingCycle);
	},
	removeQueued: (node) => {
		queued.delete(node);
	},
	strictValue,
	refreshNode,
	pure,
	untrack,
	signalBatch,
	presentQueued,
	publishNode,
	invalidateNode,
	readyState,
	commitState,
	sameState,
	releaseRetainedOwners,
	retainOwners,
	releaseRetention,
	attachObserver,
	declarationViewFork,
	isDeclarationView,
});

// Renderer transitions keep signal writes pending, including writes to signals
// loaded after an Action awaited. An islands build moves this registration into
// the renderer (see action-capability.ts).
installSignalActions();
// A server render collects its signal reads whenever signals exist.
installServerReads();
