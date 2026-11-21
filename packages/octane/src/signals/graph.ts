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
	REACTIVE_SLOW,
	REACTIVE_TRACKED_CELL,
	REACTIVE_FAILED,
	REACTIVE_QUEUED,
	REACTIVE_KEYLESS_CELL,
	REACTIVE_LISTED,
	REACTIVE_CUSTOM_EQUALS,
	REACTIVE_SPECULATIVE,
	REACTIVE_RECURSED,
	REACTIVE_RECURSED_CHECK,
	REACTIVE_WATCHING,
} from './graph-flags.js';
import {
	NATIVE_DOM_VALUE,
	forwardNativeTransitionConsumer,
	getNativeReadObserver,
	CHANGE_OBSERVED,
	READ_HISTORICAL,
	READ_OBSERVED,
	READS_SPECIAL,
	setSignalMode,
	signalMode,
	WRITE_GUARDED,
	WRITE_JOURNALED,
	getNativeAdoptionResolver,
	isNativeAdoptionMiss,
	isNativeWriteGuarded,
	nativeReadSerializer,
	reportNativeRead,
	setNativeAdoptionResolver,
	setNativeReadObserver,
	type NativeReadInspection,
	type NativeReadSource,
	type NativeReadSubscription,
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
	type SignalChange,
	type SignalChangeObserver,
	type SignalEquals,
	type SignalHandle,
	type SignalSnapshot,
	type SignalTraceEvent,
	type SignalTransaction,
	type WritableSignal,
} from './types.js';
import { isThenable } from './handle-protocol.js';

let changeObservers: Set<{ observer: SignalChangeObserver }> | undefined;
let reportingChange = false;

/** Observe metadata-only writes and committed changes without subscribing to or activating a signal. */
export function observeSignalChanges(observer: SignalChangeObserver): () => void {
	if (typeof observer !== 'function') throw new TypeError(formatClientError(165));
	const subscription = { observer };
	(changeObservers ??= new Set()).add(subscription);
	setSignalMode(CHANGE_OBSERVED, true);
	return () => {
		changeObservers?.delete(subscription);
		if (changeObservers?.size === 0) {
			changeObservers = undefined;
			setSignalMode(CHANGE_OBSERVED, false);
		}
	};
}

function reportChange(signal: SignalHandle<unknown>, phase: 'write' | 'change'): void {
	if (reportingChange || changeObservers === undefined) return;
	reportingChange = true;
	try {
		for (const { observer } of changeObservers) {
			try {
				untrack(() => pure(() => observer(signal, phase)));
			} catch {
				// Diagnostics cannot interrupt signal evaluation or delivery.
			}
		}
	} finally {
		reportingChange = false;
	}
}

export interface GraphOwner {
	readonly scopeKey: string;
	readonly epoch: number;
	readonly retired: boolean;
	/** Optional document freeze barrier; ordinary owners never allocate one. */
	readonly readBarrier?: Promise<void> | undefined;
	readonly observers: Set<SignalObserver>;
	/** Keyless cells that gained a reader, whose readers retirement must reach. */
	heldCells: PlainCell[] | undefined;
	/** Held cells that have since lost every reader, not yet compacted away. */
	heldReleased: number;
	readonly seedable: boolean;
	/** Trace events retained; zero when tracing is off. */
	readonly traceLimit: number;
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

let activeNode: ScopedNode | EffectNode | PlainComputed | undefined;
let activeOwners: Set<GraphOwner> | undefined;
let trackingCycle = 0;
let executionDepth = 0;
let pureDepth = 0;
let runningWatchHook = false;
/**
 * What a computation's reads leave in `activeOwners` when one presented a
 * node's state, whose activity may matter, and none had a foreign owner: so a
 * computation that read only plain values finishes with `activeOwners` unset.
 */
const STATE_READ: Set<GraphOwner> = new Set();

/** Record that the computation being evaluated read a value of `owner`. */
function addOwner(owner: GraphOwner): void {
	// A keyless derived value or an effect belongs to no scope and keeps no provenance.
	if (activeNode!.owner === undefined) return;
	if (activeOwners === undefined || activeOwners === STATE_READ) activeOwners = new Set();
	activeOwners.add(owner);
}
let batchDepth = 0;
let flushing = false;
/** While an owner retires: the one error state its nodes and their dependents present. */
let retirement: { readonly snapshot: RetiredSnapshot } | undefined;
let historicalReader:
	((node: ScopedNode, read: SignalReadMode) => NodeState | undefined) | undefined;
/**
 * The work the open batch delivers when it ends, in the order it was queued. A
 * node or observer holds its position (`queuedAt`), so it is queued once and
 * leaves in place; a slot whose work left is undefined.
 */
const queue: Array<Work | undefined> = [];
let queueIndex = 0;
let queueLength = 0;
/** The batch's effects, delivered after the rest of its work, in the order they were queued. */
const effectQueue: Array<EffectNode | undefined> = [];
let effectIndex = 0;
let effectLength = 0;
/** The notices of retiring owners still in the queue, so observers that share one queue it once. */
const queuedNotices = new Set<() => void>();

function enqueue(work: ScopedNode | SignalObserver): void {
	if (work.queuedAt !== 0) return;
	queue[queueLength] = work;
	work.queuedAt = ++queueLength;
}

function dequeue(work: ScopedNode | SignalObserver): void {
	const at = work.queuedAt;
	if (at === 0) return;
	queue[at - 1] = undefined;
	work.queuedAt = 0;
}
const settledThrown = new WeakSet<object>();
const noActivity = {};
const retainedOwners = new WeakMap<ScopedNode, ReadonlySet<GraphOwner>>();
const retainedNodes = new WeakMap<GraphOwner, Set<ScopedNode>>();

// Small enough that propagate, which calls it per watched node, still inlines into a write.
function notifyNode(node: ReactiveNode): void {
	if (node instanceof EffectNode) queueEffect(node);
	else if (isScopedNode(node)) keyed!.notify(node);
	else enqueue(node as SignalObserver);
}

function notifyScoped(node: ScopedNode): void {
	node.revision++;
	const wakeup = node.wakeup;
	if (wakeup !== undefined) {
		wakeup.resolve();
		node.wakeup = undefined;
	}
	if (retirement) retireState(node);
	node.owner.trace('invalidate', node);
	if (node.invalidateAttempt) {
		if (candidateHooks.defer) {
			const invalidate = node.invalidateAttempt;
			queue[queueLength++] = () => {
				// An accepted read can already have replaced this producer.
				if (node.invalidateAttempt === invalidate) invalidate();
			};
		} else node.invalidateAttempt();
		enqueue(node);
	} else if (node.kind === 'async') enqueue(node);
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
	addLink(dep, sub, version, prevDep, nextDep, prevSub);
}

/**
 * The edge linkDependency found nowhere: kept out of it, so the reuse checks every
 * tracked read makes stay small enough to inline into the read.
 */
function addLink(
	dep: ReactiveNode,
	sub: ReactiveNode,
	version: number,
	prevDep: Link | undefined,
	nextDep: Link | undefined,
	prevSub: Link | undefined,
): void {
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
	// A keyless cell's first reader: rarer than any read, so the check lives here.
	if (
		prevSub === undefined &&
		(dep.flags & (REACTIVE_KEYLESS_CELL | REACTIVE_LISTED)) === REACTIVE_KEYLESS_CELL
	)
		holdCell(dep as PlainCell);
	if (prevSub !== undefined) {
		prevSub.nextSub = newLink;
	} else {
		dep.subs = newLink;
	}
	// Last: a first observer's `watched` may write the node it starts.
	if (watchDriver) watchDriver.link(dep, sub);
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
		if (nextSub === undefined && dep.flags & REACTIVE_KEYLESS_CELL) releaseCell(dep as PlainCell);
	}
	if (watchDriver) watchDriver.unlink(dep, sub);
	return nextDep;
}

/** Finish obsolete dependencies while the computation still rejects recursive reads. */
function unlinkObsolete(node: ReactiveNode, first: Link): void {
	let obsolete: Link | undefined = first;
	try {
		do {
			obsolete = unlink(obsolete, node);
		} while (obsolete !== undefined);
	} catch (error) {
		node.flags &= ~REACTIVE_RECURSED_CHECK;
		throw error;
	}
}

function propagate(link: Link, innerWrite: boolean): void {
	const origin = link.dep;
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
			if (runningWatchHook && link.dep === origin && flags & REACTIVE_PENDING)
				sub.flags = flags | REACTIVE_DIRTY;
			flags = REACTIVE_NONE;
		} else if (!(flags & REACTIVE_RECURSED_CHECK)) {
			sub.flags = (flags & ~REACTIVE_RECURSED) | REACTIVE_PENDING;
		} else if (!(flags & (REACTIVE_DIRTY | REACTIVE_PENDING)) && isValidLink(link, sub)) {
			sub.flags = flags | (REACTIVE_RECURSED | REACTIVE_PENDING);
			if (runningWatchHook && sub instanceof EffectNode) queueEffect(sub);
			flags &= REACTIVE_MUTABLE;
		} else {
			flags = REACTIVE_NONE;
		}

		if (flags & REACTIVE_WATCHING) {
			notifyNode(sub);
		}

		if (flags & REACTIVE_MUTABLE) {
			const subSubs = (sub as ReactiveNode).subs;
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
			if (update(dep as ScopedNode)) {
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
				if (update(sub as ScopedNode)) {
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

		return !!((dirty || sub.flags & REACTIVE_DIRTY) && sub.flags);
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

/** Whether a signal write in the current synchronous context would be rejected. */
export function isSignalReadOnly(): boolean {
	return pureDepth !== 0 || activeNode instanceof PlainComputed || isNativeWriteGuarded();
}

export function assertWritable(): void {
	if (isSignalReadOnly()) throw new SignalWriteError();
}

export function setHistoricalReader(
	read: ((node: ScopedNode, read: SignalReadMode) => NodeState | undefined) | undefined,
): typeof read {
	const previous = historicalReader;
	historicalReader = read;
	setSignalMode(READ_HISTORICAL, read !== undefined);
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
	// A keyless derived value's computation rejects writes by being the active node.
	const guard = previousNode instanceof PlainComputed;
	if (guard) pureDepth++;
	activeNode = undefined;
	try {
		return run();
	} finally {
		activeNode = previousNode;
		if (guard) pureDepth--;
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
	// Most batches queue nothing: a write nothing observes, or a read-only action.
	if (--batchDepth === 0 && (queueLength | effectLength) !== 0) flush();
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
	// Delivery is untracked: nothing a subscriber reads becomes a dependency of the
	// computation or render, if any, whose batch ended here.
	const previousNode = activeNode;
	const previousObserver = signalMode & READ_OBSERVED ? setNativeReadObserver(null) : null;
	activeNode = undefined;
	let firstError: unknown;
	let failed = false;
	try {
		// One failing delivery does not stop the rest: the drain resumes after it.
		while (true) {
			try {
				drain();
				break;
			} catch (error) {
				if (!failed) firstError = error;
				failed = true;
			}
		}
	} finally {
		flushing = false;
		queueIndex = queueLength = effectIndex = effectLength = 0;
		activeNode = previousNode;
		if (previousObserver !== null) setNativeReadObserver(previousObserver);
	}
	if (failed) throw firstError;
}

/**
 * Deliver the queue in order, then each effect, which the effects' own queue keeps
 * monomorphic; work either queues meanwhile joins the same pass.
 */
function drain(): void {
	while (true) {
		if (queueIndex === queueLength) {
			if (effectIndex === effectLength) return;
			const effect = effectQueue[effectIndex]!;
			effectQueue[effectIndex++] = undefined;
			runEffect(effect);
			continue;
		}
		const work = queue[queueIndex];
		queue[queueIndex++] = undefined;
		if (work instanceof SignalObserver) {
			work.queuedAt = 0;
			runObserver(work);
		} else if (typeof work === 'function') {
			// A notice that ran can be queued again, as any other work can.
			if (queuedNotices.size !== 0) queuedNotices.delete(work);
			work();
		} else if (work !== undefined) {
			work.queuedAt = 0;
			if (!work.owner.retired) keyed!.refresh(work);
		}
	}
}

/**
 * Deliver the queued presentation (native) observers now, ahead of the rest of
 * the batch: a promoted transition updates its DOM bindings before any public
 * subscriber hears of it (pending.ts).
 */
function presentQueued(): void {
	let firstError: unknown;
	let failed = false;
	untrack(() => {
		for (let at = queueIndex; at < queueLength; at++) {
			const work = queue[at];
			if (!(work instanceof SignalObserver) || !work.native) continue;
			dequeue(work);
			try {
				runObserver(work);
			} catch (error) {
				if (!failed) firstError = error;
				failed = true;
			}
		}
	});
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

/**
 * The error snapshot the nodes of a retired owner present. A read of one of
 * those nodes is refused before it reaches its state, so most are never looked
 * at, and an Error captures a stack: the error is built when first read.
 */
class RetiredSnapshot {
	readonly status = 'error';
	readonly refreshing = false;
	readonly connection = 'none';
	readonly complete = false;
	readonly #scopeKey: string;
	#error: ScopeDisposedError | undefined = undefined;

	constructor(scopeKey: string) {
		this.#scopeKey = scopeKey;
	}

	get error(): ScopeDisposedError {
		return (this.#error ??= new ScopeDisposedError(this.#scopeKey));
	}
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
	if (node.owner !== consumer.owner) addOwner(node.owner);
	if (state.owners) {
		for (const owner of state.owners) {
			if (owner !== consumer.owner) addOwner(owner);
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
		// This state stays readable on a live node, so it is an ordinary error state.
		commitState(node, withOwners(errorState(retirement!.snapshot.error), surviving));
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

/** A node's rarely held parts (see ScopedNode.#cold). One class, so every node's side object shares a shape. */
class ColdState<T> {
	storedState: NodeState<T> | undefined = undefined;
	storedLastState: NodeState<T> | undefined = undefined;
	queuedAt = 0;
	invalidateAttempt: (() => void) | undefined = undefined;
	wakeup: Wakeup | undefined = undefined;
	nativeSource: NativeReadSource | undefined = undefined;
	nativeLatestSource: NativeReadSource | undefined = undefined;
	nativeSnapshotSource: NativeReadSource | undefined = undefined;
	retryRequest: ((options?: { pending?: boolean }) => void) | undefined = undefined;
	pending: PendingSlotLike | undefined = undefined;
}

export class ScopedNode<T = any> implements SignalHandle<T>, ReactiveNode {
	/** Recognize a native node without observing an arbitrary imported value. */
	static hasNativeBrand(value: object): value is ScopedNode {
		return #cold in value;
	}

	/** A branded node's transition slot, read without running a getter. */
	static pendingSlotOf(node: ScopedNode): PendingSlotLike | undefined {
		return node.#cold?.pending;
	}

	/** A branded node's stored state, read without running a getter. */
	static storedStateOf(node: ScopedNode): NodeState | undefined {
		return node.#cold?.storedState;
	}

	/**
	 * Whether the cell's own `equals` finds two values Object.is told apart
	 * equal. Such a write keeps the previous value and notifies no one.
	 */
	isEqual(previous: T, next: T): boolean {
		// setEquals marks every cell it gives one REACTIVE_SLOW.
		const equals = this.flags & REACTIVE_SLOW ? cellEquals?.get(this) : undefined;
		return equals !== undefined && !restoring && untrack(() => equals(previous, next));
	}

	declare readonly [SIGNAL_HANDLE]: true;
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
	compute: ((target: ScopedNode<T>) => NodeState<T>) | undefined;
	/**
	 * The synchronous computation behind `compute`, when `compute` only runs it
	 * and presents its result (derivedState). `updatePlain` calls it directly.
	 */
	plain: (() => T) | undefined = undefined;
	last: T | undefined = undefined;
	hasLast = false;
	/**
	 * What only some nodes hold (stored states, a waiter, native read channels,
	 * a transition slot, a queue position), allocated on the first such value.
	 * A plain cell or computation never has one, which keeps it small. It is
	 * also the brand `hasNativeBrand` tests.
	 */
	#cold: ColdState<T> | undefined = undefined;

	#warm(): ColdState<T> {
		return (this.#cold ??= new ColdState<T>());
	}

	/** Forget the stored states, which a plain node has none of. */
	dropStoredStates(): void {
		const cold = this.#cold;
		if (cold !== undefined) cold.storedState = cold.storedLastState = undefined;
	}

	/** Whether the node is being computed; RECURSED_CHECK marks exactly that span. */
	get evaluating(): boolean {
		return (this.flags & REACTIVE_RECURSED_CHECK) !== 0;
	}

	get storedState(): NodeState<T> | undefined {
		return this.#cold?.storedState;
	}
	set storedState(state: NodeState<T> | undefined) {
		if (state !== undefined) this.#warm().storedState = state;
		else if (this.#cold !== undefined) this.#cold.storedState = undefined;
	}

	get storedLastState(): NodeState<T> | undefined {
		return this.#cold?.storedLastState;
	}
	set storedLastState(state: NodeState<T> | undefined) {
		if (state !== undefined) this.#warm().storedLastState = state;
		else if (this.#cold !== undefined) this.#cold.storedLastState = undefined;
	}

	/** This node's place in the batch's queue, counted from one; zero when it is not queued. */
	get queuedAt(): number {
		return this.#cold?.queuedAt ?? 0;
	}
	set queuedAt(at: number) {
		if (at !== 0) this.#warm().queuedAt = at;
		else if (this.#cold !== undefined) this.#cold.queuedAt = 0;
	}

	get invalidateAttempt(): (() => void) | undefined {
		return this.#cold?.invalidateAttempt;
	}
	set invalidateAttempt(invalidate: (() => void) | undefined) {
		if (invalidate !== undefined) this.#warm().invalidateAttempt = invalidate;
		else if (this.#cold !== undefined) this.#cold.invalidateAttempt = undefined;
	}

	get wakeup(): Wakeup | undefined {
		return this.#cold?.wakeup;
	}
	set wakeup(wakeup: Wakeup | undefined) {
		if (wakeup !== undefined) this.#warm().wakeup = wakeup;
		else if (this.#cold !== undefined) this.#cold.wakeup = undefined;
	}

	get nativeSource(): NativeReadSource | undefined {
		return this.#cold?.nativeSource;
	}

	get nativeLatestSource(): NativeReadSource | undefined {
		return this.#cold?.nativeLatestSource;
	}

	/** A resource's retry. */
	get retryRequest(): ((options?: { pending?: boolean }) => void) | undefined {
		return this.#cold?.retryRequest;
	}
	set retryRequest(retry: ((options?: { pending?: boolean }) => void) | undefined) {
		if (retry !== undefined) this.#warm().retryRequest = retry;
		else if (this.#cold !== undefined) this.#cold.retryRequest = undefined;
	}

	/**
	 * The node's state inside a transition that has not committed (pending.ts),
	 * or, on that slot's private shadow node, the slot it presents.
	 */
	get pending(): PendingSlotLike | undefined {
		return this.#cold?.pending;
	}
	set pending(slot: PendingSlotLike | undefined) {
		if (slot !== undefined) this.#warm().pending = slot;
		else if (this.#cold !== undefined) this.#cold.pending = undefined;
	}

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
		const cold = this.#warm();
		if (read === 'value') return (cold.nativeSource ??= createNativeSource(this, read));
		if (read === 'latest') return (cold.nativeLatestSource ??= createNativeSource(this, read));
		return (cold.nativeSnapshotSource ??= createNativeSource(this, read));
	}

	/** The existing snapshot channel, without creating one during transition cleanup. */
	get nativeSnapshotSource(): NativeReadSource | undefined {
		return this.#cold?.nativeSnapshotSource;
	}

	constructor(
		readonly owner: GraphOwner,
		readonly key: string,
		readonly kind: 'signal' | 'derived' | 'async',
	) {
		this.flags =
			REACTIVE_MUTABLE |
			REACTIVE_WATCHING |
			REACTIVE_DIRTY |
			(owner.traceLimit !== 0 ? REACTIVE_SLOW : 0);
	}

	get(): T {
		return readValue(this);
	}

	declare [SIGNAL_BINDING_READ]: () => T;
	declare [SIGNAL_BINDING_SUBSCRIBE]: (
		notify: () => void,
		onRetire?: () => void,
		speculative?: boolean,
	) => NativeReadSubscription;
	declare [SIGNAL_BINDING_RETIRED]: () => boolean;
	declare [SIGNAL_BINDING_IDENTITY]: () => { scope: 'instance'; nodeKey: string };
	declare [NATIVE_DOM_VALUE]: () => T;

	set(value: T | ((previous: T) => T)): void {
		// The common write, in the shape of alien-signals': a value, not an updater,
		// for a current cell of a live, untraced owner, outside any computation, guard
		// or transition. It changes nothing but the value and what depends on it.
		if (
			(signalMode & (WRITE_GUARDED | WRITE_JOURNALED | CHANGE_OBSERVED)) === 0 &&
			pureDepth === 0 &&
			!(activeNode instanceof PlainComputed) &&
			this.valueOnly &&
			!(this.flags & (REACTIVE_DIRTY | REACTIVE_PENDING | REACTIVE_SLOW)) &&
			this.kind === 'signal' &&
			this.pending === undefined &&
			typeof value !== 'function' &&
			(pendingSignals === undefined || pendingSignals.batch() === null)
		) {
			if (
				!(this.last === value
					? value !== 0 || 1 / (this.last as number) === 1 / (value as number)
					: value !== value && this.last !== this.last)
			) {
				storeValue(this, value);
				const subs = this.subs;
				if (subs !== undefined) {
					batchDepth++;
					try {
						propagate(subs, executionDepth !== 0);
						shallowPropagate(subs);
					} finally {
						batchDepth--;
					}
				}
			}
			if (batchDepth === 0 && (queueLength | effectLength) !== 0) flush();
			return;
		}
		assertAlive(this.owner);
		assertWritable();
		if (this.kind !== 'signal') throw new TypeError(formatClientError(164));
		if (signalMode & CHANGE_OBSERVED) reportChange(this, 'write');
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
			if (!Object.is(previous, next) && !this.isEqual(previous, next)) {
				if (journal !== undefined && !journal.has(this)) journal.set(this, previous);
				writeValue(this, next);
				if (signalMode & CHANGE_OBSERVED) reportChange(this, 'change');
				this.owner.trace('write', this);
			}
			// A pending transition value re-applies the update on top, even an
			// update that leaves committed state equal. A transaction records the
			// pending value first, and its rollback puts that back rather than
			// rebasing again.
			const slot = this.pending;
			if (slot !== undefined && restoring !== ROLLING_BACK) {
				if (journal !== undefined && !journal.has(slot))
					journal.set(slot, strictValue(refreshNode(slot.shadow!), this.key));
				pending!.rebase(this, value);
			}
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
		return attachObserver(this, notify, false);
	}
}

// Capture these alongside the class, before a caller can replace a public
// read and later load a separately compiled hydration consumer.
export const hasScopedNodeBrand = /* @__PURE__ */ (() => ScopedNode.hasNativeBrand)();
export const originalScopedNodeGet = /* @__PURE__ */ (() => ScopedNode.prototype.get)();
export const scopedNodePendingSlot = /* @__PURE__ */ (() => ScopedNode.pendingSlotOf)();
export const scopedNodeStoredState = /* @__PURE__ */ (() => ScopedNode.storedStateOf)();
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

	/** Private proof used only by an opted native projection observer. */
	__matchesNativeDomHandle(handle: unknown): boolean {
		return (
			this.read === 'value' &&
			this.view === undefined &&
			handle === this.node &&
			this.node[NATIVE_DOM_VALUE] === ScopedNode.prototype[NATIVE_DOM_VALUE]
		);
	}

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
		// A quiet node is not told of a change, so while one may have reached it no
		// earlier read of it can be reused.
		const flags = node.flags;
		if (!(flags & REACTIVE_WATCHING) && flags & (REACTIVE_DIRTY | REACTIVE_PENDING)) return NaN;
		// A render that reads the node's pending state cannot reuse a committed read.
		return pendingWorld && pendingWorld.hides(node) ? NaN : node.revision;
	}

	subscribe(notify: () => void, speculative?: boolean): NativeReadSubscription {
		const canonical = this.canonicalSource();
		if (canonical) return canonical.subscribe(notify, speculative);
		assertAlive(this.node.owner);
		return attachObserver(this.node, notify, true, speculative);
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
	trackRead(node, read);
	const state = node.state!;
	const observed =
		read === 'latest' && state.snapshot.status !== 'ready' ? (node.lastState ?? state) : state;
	if (activeNode !== undefined && activeOwners === undefined) activeOwners = STATE_READ;
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
export function readValue<T>(node: ScopedNode<T>): T {
	// The common read: a value-only node in a live owner, read while nothing presents
	// another value or collects reads. A stale plain computation is brought up to date
	// here; anything else (a node being computed, a re-entered or retired one) goes on.
	if (
		node.valueOnly &&
		(signalMode & (READS_SPECIAL | CHANGE_OBSERVED)) === 0 &&
		!(node.flags & (REACTIVE_RECURSED | REACTIVE_RECURSED_CHECK | REACTIVE_SLOW)) &&
		fresh(node)
	) {
		const reader = activeNode;
		if (reader !== undefined) {
			linkDependency(node, reader, trackingCycle);
			// A plain ready state carries no owners of its own.
			if (node.owner !== reader.owner) addOwner(node.owner);
		}
		return node.last as T;
	}
	return readCollected(node);
}

/**
 * Bring a value-only node up to date as refresh() would, when it is a plain
 * computation or already current; false when only refresh() can.
 */
function fresh(node: ScopedNode): boolean {
	const flags = node.flags;
	if (!(flags & (REACTIVE_DIRTY | REACTIVE_PENDING))) return true;
	if (node.plain === undefined) return false;
	let dirty = (flags & REACTIVE_DIRTY) !== 0;
	if (!dirty) {
		// Dependency checks belong to the computation's pure read boundary (see refresh).
		pureDepth++;
		try {
			dirty = checkDirty(node.deps!, node);
		} finally {
			pureDepth--;
		}
		if (!dirty) node.flags = flags & ~REACTIVE_PENDING;
	}
	if (dirty && keyed!.updatePlain(node) && node.subs !== undefined) shallowPropagate(node.subs);
	return node.valueOnly && !(node.flags & (REACTIVE_DIRTY | REACTIVE_PENDING));
}

/** readValue() while a render collects reads, or for anything but a plain value. */
function readCollected<T>(node: ScopedNode<T>): T {
	if (
		node.valueOnly &&
		(node.flags & CURRENT) === REACTIVE_MUTABLE &&
		!node.owner.retired &&
		presentsLive()
	) {
		const reader = activeNode;
		if (reader !== undefined) {
			linkDependency(node, reader, trackingCycle);
			if (node.owner !== reader.owner) addOwner(node.owner);
		}
		if (getNativeReadObserver()) reportNativeRead(node.nativeReadSource('value'), node.revision);
		return node.last as T;
	}
	return readOtherValue(node);
}

/**
 * Object.is. Hot comparisons write it out in place instead: one shared helper
 * gathers every value type's comparison feedback, which makes each of them
 * slower than a site that only ever compares, say, numbers.
 */
function same(a: unknown, b: unknown): boolean {
	return a === b ? a !== 0 || 1 / (a as number) === 1 / (b as number) : a !== a && b !== b;
}

/** The flags a read tests: a current node has only REACTIVE_MUTABLE of them. */
const CURRENT =
	REACTIVE_MUTABLE |
	REACTIVE_DIRTY |
	REACTIVE_PENDING |
	REACTIVE_RECURSED |
	REACTIVE_RECURSED_CHECK;

/** Whether reads see live nodes as they are: no transition world, history or adoption frame. */
function presentsLive(): boolean {
	return (signalMode & (READS_SPECIAL & ~READ_OBSERVED)) === 0;
}

function readOtherValue<T>(node: ScopedNode<T>): T {
	if (pendingWorld || historicalReader || (node.owner.seedable && getNativeAdoptionResolver()))
		return strictValue(readNode(node), node.key);
	refresh(node);
	if (!node.valueOnly) return strictValue(observeRead(node, 'value'), node.key);
	trackRead(node, 'value');
	// A plain ready state carries no owners of its own.
	if (activeNode && node.owner !== activeNode.owner) addOwner(node.owner);
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
	node.dropStoredStates();
	node.revision++;
}

/** After committing a plain ready state, keep only its value. */
function dropStates(node: ScopedNode): void {
	node.valueOnly = true;
	node.dropStoredStates();
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
	// A plain computation being updated is marked by its flags alone (updatePlain).
	if (node.evaluating || (node.plain !== undefined && node.flags & REACTIVE_RECURSED_CHECK))
		throw new SignalCycleError(node.key);
	// A current node, the common read, has nothing to check or evaluate.
	const current = node.flags;
	if (!(current & (REACTIVE_DIRTY | REACTIVE_PENDING))) {
		if (current & REACTIVE_RECURSED) node.flags = current & ~REACTIVE_RECURSED;
		return;
	}
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
				if (update(node) && node.subs) shallowPropagate(node.subs);
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

function evaluate(node: ScopedNode, stabilizing?: boolean): boolean {
	if (!node.compute) {
		node.flags = REACTIVE_MUTABLE | REACTIVE_WATCHING | (node.flags & REACTIVE_SLOW);
		return true;
	}
	if (historicalReader || getNativeAdoptionResolver()) return evaluateLiveNode(node, stabilizing);
	const pending = pendingWorld;
	const world = pending ? pending.enter(node) : undefined;
	const previousNode = activeNode;
	const previousOwners = activeOwners;
	const previousObserver = setNativeReadObserver(null);
	node.depsTail = undefined;
	node.flags =
		REACTIVE_MUTABLE | REACTIVE_WATCHING | REACTIVE_RECURSED_CHECK | (node.flags & REACTIVE_SLOW);
	activeNode = node;
	activeOwners = undefined;
	trackingCycle++;
	executionDepth++;
	let next: NodeState | undefined;
	let failure = NO_FAILURE;
	let owners: Set<GraphOwner> | undefined;
	try {
		next = node.compute(node);
	} catch (error) {
		failure = error;
	} finally {
		executionDepth--;
		// compute() reassigned activeOwners, which this function narrowed to undefined.
		owners = activeOwners as Set<GraphOwner> | undefined;
		activeOwners = previousOwners;
		activeNode = previousNode;
		setNativeReadObserver(previousObserver);
		const tail = (node as ReactiveNode).depsTail;
		const obsolete = tail ? tail.nextDep : node.deps;
		if (obsolete) unlinkObsolete(node, obsolete);
		node.flags &= ~REACTIVE_RECURSED_CHECK;
		if (pending) pending.leave(world, node);
	}
	if (node.flags & REACTIVE_RECURSED) {
		if (next === PLAIN_RESULT) plainValue = undefined;
		return stabilizing ? false : stabilizeScoped(node);
	}
	return settle(node, failure === NO_FAILURE ? next! : thrownState(node, failure), owners);
}

/** What a computation that threw leaves: pending on a thenable, failed on anything else. */
function thrownState(node: ScopedNode, error: unknown): NodeState {
	if (!isThenable(error)) return errorState(error);
	const wakeup = !node.wakeup || node.wakeup.settled ? (node.wakeup = createWakeup()) : node.wakeup;
	// The thenable retains the node only while the node waits on it.
	wakeup.node = node;
	if (wakeup.thrown !== error) {
		wakeup.thrown = error;
		// A thenable that already settled cannot report a change: rethrowing it
		// waits for a dependency instead of evaluating again on every microtask.
		if (!settledThrown.has(error)) {
			const settled = () => settleThrown(wakeup, error);
			Promise.resolve(error).then(settled, settled);
		}
	}
	return pendingState(wakeup.promise);
}

const NO_FAILURE: unknown = {};

/**
 * `compute`, returning the derived node's previous value instead of a result
 * `equals` finds equal to it, so the node keeps that reference and its plain
 * Object.is comparison reports no change. A node with no value yet, or one
 * that failed, compares nothing.
 */
export function computeEqual<T>(
	node: ScopedNode<T> | PlainComputed<T>,
	compute: () => T,
	equals: SignalEquals<T>,
): () => T {
	// A keyless node holds its value or error in `last`; until its first result,
	// and from a failure until its next, `last` is NO_FAILURE.
	if (node instanceof PlainComputed) node.last = NO_FAILURE;
	return () => equalComputedValue(node, compute(), equals);
}

/** Compare only after obsolete watched dependencies have finished their cleanup. */
export function equalComputedValue<T>(
	node: ScopedNode<T> | PlainComputed<T>,
	next: T,
	equals: SignalEquals<T>,
): T {
	if (node.flags & REACTIVE_RECURSED) return next;
	const previous = node instanceof PlainComputed ? node.last : readyValueOf(node);
	if (previous === NO_FAILURE || same(previous, next)) return next;
	const tail = node.depsTail;
	const obsolete = tail ? tail.nextDep : node.deps;
	if (obsolete) unlinkObsolete(node, obsolete);
	if (node.flags & REACTIVE_RECURSED) return next;
	return untrack(() => equals(previous as T, next)) ? (previous as T) : next;
}

/** A keyed node's ready value, or NO_FAILURE when it has none. */
function readyValueOf(node: ScopedNode): unknown {
	if (node.valueOnly) return node.last;
	const snapshot = node.storedState?.snapshot;
	return snapshot?.status === 'ready' ? snapshot.value : NO_FAILURE;
}

/**
 * evaluate() for a plain computation while reads see live nodes and no render
 * collects them, in the shape of alien-signals' update: no world to enter, no
 * native observer to set aside, no wrapper to call through. A computation that
 * read only plain values and returned one stores it here; a throw, a thenable,
 * a read that presented a state or a foreign owner settles as evaluate() does.
 * Writes are rejected (pureDepth); a cycle is caught by the RECURSED_CHECK flag.
 */
function updatePlain(node: ScopedNode, stabilizing?: boolean): boolean {
	node.depsTail = undefined;
	node.flags =
		REACTIVE_MUTABLE | REACTIVE_RECURSED_CHECK | (node.flags & (REACTIVE_WATCHING | REACTIVE_SLOW));
	const previousNode = activeNode;
	const previousOwners = activeOwners;
	activeNode = node;
	activeOwners = undefined;
	pureDepth++;
	let value: unknown;
	let failure = NO_FAILURE;
	let owners: Set<GraphOwner> | undefined;
	try {
		++trackingCycle;
		value = node.plain!();
	} catch (error) {
		failure = error;
	} finally {
		pureDepth--;
		owners = activeOwners as Set<GraphOwner> | undefined;
		activeNode = previousNode;
		activeOwners = previousOwners;
		const tail = (node as ReactiveNode).depsTail;
		const obsolete = tail ? tail.nextDep : node.deps;
		if (obsolete) unlinkObsolete(node, obsolete);
		node.flags &= ~REACTIVE_RECURSED_CHECK;
	}
	if (node.flags & REACTIVE_RECURSED) return stabilizing ? false : stabilizeScoped(node);
	if (failure === NO_FAILURE && owners === undefined && node.valueOnly && !isThenable(value)) {
		if (
			node.last === value
				? value !== 0 || 1 / (node.last as number) === 1 / (value as number)
				: value !== value && node.last !== node.last
		)
			return false;
		storeValue(node, value);
		return true;
	}
	return settlePlain(node, failure, value, owners);
}

/** Discard watched-setup rounds before publishing; every retry compares with the committed state. */
function stabilizeScoped(node: ScopedNode): boolean {
	let rounds = 0;
	while (true) {
		if (++rounds > 100) throw new SignalCycleError(node.key);
		const changed =
			node.plain !== undefined && (signalMode & READS_SPECIAL) === 0
				? updatePlain(node, true)
				: evaluate(node, true);
		if (!(node.flags & REACTIVE_RECURSED)) return changed;
	}
}

/** updatePlain() for anything but a plain result; the node may stay quiet only with one. */
function settlePlain(
	node: ScopedNode,
	failure: unknown,
	value: unknown,
	owners: Set<GraphOwner> | undefined,
): boolean {
	node.flags |= REACTIVE_WATCHING;
	const changed =
		failure !== NO_FAILURE
			? settle(node, thrownState(node, failure), owners)
			: isThenable(value)
				? settle(node, errorState(new TypeError(formatClientError(166))), owners)
				: settle(node, derivedResult(node, value), owners);
	// A node with a plain value is quiet: a change that reaches it marks it stale
	// without telling it (notifyNode), and its native readers learn that it may
	// have changed from its flags (GraphReadSource.getVersion). A waiter or a trace
	// still needs telling.
	if (node.valueOnly && node.wakeup === undefined && node.owner.traceLimit === 0)
		node.flags &= ~REACTIVE_WATCHING;
	return changed;
}

/** evaluate(node), by the plain steps when the node and the moment allow them. */
function update(node: ScopedNode | PlainComputed): boolean {
	if (node instanceof PlainComputed) return updateLean(node);
	return keyed!.update(node);
}

function updateScoped(node: ScopedNode): boolean {
	if (node.plain !== undefined && (signalMode & (READS_SPECIAL | CHANGE_OBSERVED)) === 0)
		return updatePlain(node);
	if (signalMode & CHANGE_OBSERVED) {
		const changed =
			node.plain !== undefined && (signalMode & READS_SPECIAL) === 0
				? updatePlain(node)
				: evaluate(node);
		if (changed && node.kind !== 'signal') reportChange(node, 'change');
		return changed;
	}
	return evaluate(node);
}

/** Commit what a computation left; returns whether the node's value or state changed. */
function settle(node: ScopedNode, next: NodeState, owners: Set<GraphOwner> | undefined): boolean {
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

function evaluateLiveNode(node: ScopedNode, stabilizing?: boolean): boolean {
	// First-use declarations can create live graph nodes while the renderer is
	// presenting a historical seed. Their computations still need live inputs
	// and dependency edges; the enclosing read retains its historical channel.
	const previousReader = setHistoricalReader(undefined);
	const previousAdoption = setNativeAdoptionResolver(null);
	try {
		return evaluate(node, stabilizing);
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
	probe.flags |= REACTIVE_SLOW;
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
	/** This observer's place in the batch's queue, counted from one; zero when it is not queued. */
	queuedAt = 0;
	/**
	 * What a public subscriber last heard of: the plain ready value of a
	 * value-only node while `plain`, otherwise the state in `previous`.
	 */
	plain = false;
	value: unknown = undefined;

	constructor(
		public node: ScopedNode | undefined,
		public notify: (() => void) | undefined,
		readonly native: boolean,
		public previous: NodeState | undefined,
	) {}

	setObserved(observed: boolean): void {
		if (!this.node || !this.flags || observed === !(this.flags & REACTIVE_SPECULATIVE)) return;
		if (observed) {
			this.flags &= ~REACTIVE_SPECULATIVE;
			if (watchDriver) watchDriver.link(this.node, this);
		} else {
			// A watched cleanup can dispose this reader and unlink the edge again.
			this.flags |= REACTIVE_SPECULATIVE;
			if (watchDriver) watchDriver.unlink(this.node, null);
		}
	}
}

/** Whether `state` is the plain ready state of `value`, as a value-only node's is. */
function isPlainReady(state: NodeState | undefined, value: unknown): boolean {
	if (state === undefined || state.owners?.size) return false;
	const snapshot = state.snapshot;
	return (
		snapshot.status === 'ready' &&
		!snapshot.refreshing &&
		snapshot.connection === 'none' &&
		snapshot.complete &&
		snapshot.requestKey === undefined &&
		Object.is(snapshot.value, value)
	);
}

/**
 * Bring a public subscriber's node up to date and record what it now presents.
 * Returns whether that equals what the subscriber last heard of, by sameState,
 * without building a value-only node's state.
 */
function observeCurrent(observer: SignalObserver, observed: ScopedNode): boolean {
	const node = observed as ScopedNode | PlainComputed | PlainCell;
	if (node instanceof PlainComputed) {
		try {
			refreshLean(node);
		} catch {
			// A failure is what the subscriber hears of; its readers see the error.
		}
		const value = node.last;
		const ready = !(node.flags & REACTIVE_FAILED);
		if (observer.plain === ready && same(observer.value, value)) return true;
		observer.plain = ready;
		observer.value = value;
		observer.previous = undefined;
		return false;
	}
	if (node instanceof PlainCell) {
		if (observer.plain && Object.is(observer.value, node.last)) return true;
		observer.plain = true;
		observer.value = node.last;
		return false;
	}
	return keyed!.observe(observer, node);
}

function observeScoped(observer: SignalObserver, node: ScopedNode): boolean {
	// Bringing a node up to date tracks no read, so it needs no untracking.
	if (!(
		node.valueOnly &&
		(signalMode & (READS_SPECIAL | CHANGE_OBSERVED)) === 0 &&
		!(node.flags & (REACTIVE_RECURSED | REACTIVE_RECURSED_CHECK | REACTIVE_SLOW)) &&
		fresh(node)
	))
		refresh(node);
	if (node.valueOnly) {
		const value = node.last;
		if (observer.plain ? Object.is(observer.value, value) : isPlainReady(observer.previous, value))
			return true;
		observer.plain = true;
		observer.value = value;
		observer.previous = undefined;
		return false;
	}
	const state = node.state!;
	if (observer.plain ? isPlainReady(state, observer.value) : sameState(observer.previous, state))
		return true;
	observer.plain = false;
	observer.value = undefined;
	observer.previous = state;
	return false;
}

export function attachObserver(
	node: ScopedNode,
	notify: () => void,
	native: boolean,
	speculative = false,
): NativeReadSubscription {
	const observer = new SignalObserver(node, notify, native, undefined);
	if (speculative) observer.flags |= REACTIVE_SPECULATIVE;
	// A public subscriber hears of changes from what its node presents now.
	if (!native) observeCurrent(observer, node);
	// Link last: no call follows it, so an exhausted native stack cannot leave
	// a linked observer whose stop never reached the caller.
	// A keyless derived value has no owner to stop its subscribers.
	node.owner?.observers.add(observer);
	try {
		linkDependency(node, observer, ++trackingCycle);
	} catch (error) {
		stopObserver(observer);
		throw error;
	}
	const dispose: NativeReadSubscription = () => stopObserver(observer);
	if (speculative) dispose.observation = observer;
	return dispose;
}

/** Internal attempt dependency subscription; callers already hold a graph lease. */
export function subscribeNode(node: ScopedNode, notify: () => void): () => void {
	untrack(() => refreshNode(node));
	return attachObserver(node, notify, true);
}

function runObserver(observer: SignalObserver): void {
	const node = observer.node;
	if (!node || !observer.flags) return;
	observer.flags = REACTIVE_WATCHING | (observer.flags & REACTIVE_SPECULATIVE);
	if (!observer.native) {
		// The common case: a subscriber that last heard of a plain value, of a node
		// that still holds one once brought up to date.
		if (
			observer.plain &&
			node.valueOnly &&
			(signalMode & (READS_SPECIAL | CHANGE_OBSERVED)) === 0 &&
			!(node.flags & (REACTIVE_RECURSED | REACTIVE_RECURSED_CHECK | REACTIVE_SLOW)) &&
			fresh(node)
		) {
			const value = node.last;
			if (
				observer.value === value
					? value !== 0 || 1 / (observer.value as number) === 1 / (value as number)
					: value !== value && observer.value !== observer.value
			)
				return;
			observer.value = value;
		} else if (observeCurrent(observer, node)) return;
	}
	// Its callers deliver untracked.
	const notify = observer.notify;
	if (notify) notify();
}

/**
 * A keyless writable signal, `scope.signal$(null, initial)`: the shape of
 * alien-signals' signal (its graph links, flags, value and owner), joined to the
 * same graph as every other node. Nothing serializes, inspects or reseeds it,
 * and a transition does not stage its writes: they apply at once. Its scope
 * owns it, so it stops answering once the scope retires.
 */
export class PlainCell<T = any> implements ReactiveNode {
	// Assigned in the constructor, not as class fields, which would compile a separate
	// initializer function: a cell is as cheap to create as alien-signals' signal.
	declare subs: ReactiveNode['subs'];
	declare subsTail: ReactiveNode['subsTail'];
	declare flags: ReactiveFlags;
	declare last: T;
	declare readonly owner: GraphOwner;
	declare readonly valueOnly: true;
	declare readonly kind: 'signal';
	declare readonly key: '';
	declare readonly deps: undefined;
	declare readonly depsTail: undefined;

	// Every keyless node starts flags, then subs or run, then deps: graph walks read
	// one field of mixed node kinds, and a shared offset keeps that read a single load.
	constructor(last: T, owner: GraphOwner) {
		this.flags = REACTIVE_MUTABLE | REACTIVE_KEYLESS_CELL;
		this.subs = undefined;
		this.subsTail = undefined;
		this.last = last;
		(this as { owner: GraphOwner }).owner = owner;
	}

	get [SIGNAL_HANDLE](): true {
		return true;
	}

	get(): T {
		if ((signalMode & READS_SPECIAL) === 0 && !this.owner.retired) {
			const reader = activeNode;
			if (reader !== undefined) {
				linkDependency(this, reader, trackingCycle);
				if (this.owner !== reader.owner) addOwner(this.owner);
			}
			return this.last;
		}
		return readCellOther(this);
	}

	set(value: T | ((previous: T) => T)): void {
		// The common write, kept small so propagate inlines into it: a value, outside
		// any computation, guard or effect, to a live cell no render has read.
		if (
			signalMode === 0 &&
			pureDepth === 0 &&
			activeNode === undefined &&
			typeof value !== 'function' &&
			!(this.flags & (REACTIVE_TRACKED_CELL | REACTIVE_CUSTOM_EQUALS)) &&
			!this.owner.retired
		) {
			if (
				this.last === value
					? value !== 0 || 1 / (this.last as number) === 1 / (value as number)
					: value !== value && this.last !== this.last
			)
				return;
			this.last = value;
			const subs = this.subs;
			if (subs === undefined) return;
			batchDepth++;
			try {
				propagate(subs, executionDepth !== 0);
				shallowPropagate(subs);
			} finally {
				batchDepth--;
			}
			if (batchDepth === 0 && (queueLength | effectLength) !== 0) flush();
			return;
		}
		writeCell(this, value);
	}

	latest(): T | undefined;
	latest<F>(fallback: F): T | F;
	latest(): T {
		assertAlive(this.owner);
		return this.last;
	}

	snapshot(): SignalSnapshot<T> {
		assertAlive(this.owner);
		return Object.freeze(readyState(this.last).snapshot);
	}

	/** Subscriptions do not deliver an initial notification. */
	subscribe(notify: () => void): () => void {
		assertAlive(this.owner);
		assertWritable();
		if (typeof notify !== 'function') throw new TypeError(formatClientError(165));
		return attachObserver(this as unknown as ScopedNode, notify, false);
	}

	[SIGNAL_BINDING_READ](): T {
		assertAlive(this.owner);
		return this.last;
	}

	[SIGNAL_BINDING_SUBSCRIBE](
		notify: () => void,
		onRetire?: () => void,
		speculative?: boolean,
	): NativeReadSubscription {
		assertAlive(this.owner);
		return attachObserver(
			this as unknown as ScopedNode,
			onRetire === undefined ? notify : () => (this.owner.retired ? onRetire() : notify()),
			true,
			speculative,
		);
	}

	[SIGNAL_BINDING_RETIRED](): boolean {
		return this.owner.retired;
	}

	[SIGNAL_BINDING_IDENTITY]() {
		return { scope: 'instance' as const, nodeKey: '' };
	}

	[NATIVE_DOM_VALUE](): T {
		return this.get();
	}
}

function writeCell<T>(cell: PlainCell<T>, value: T | ((previous: T) => T)): void {
	// Outside any computation, guard or effect the write needs no further check.
	if (signalMode !== 0 || pureDepth !== 0 || activeNode !== undefined) {
		if (
			(signalMode & WRITE_GUARDED) !== 0 ||
			pureDepth !== 0 ||
			activeNode instanceof PlainComputed
		)
			throw new SignalWriteError();
	}
	assertAlive(cell.owner);
	if (signalMode & CHANGE_OBSERVED) reportChange(cell as unknown as SignalHandle<unknown>, 'write');
	const next =
		typeof value === 'function'
			? untrack(() => pure(() => (value as (previous: T) => T)(cell.last)))
			: value;
	if (
		!same(cell.last, next) &&
		!(
			cell.flags & REACTIVE_CUSTOM_EQUALS &&
			!restoring &&
			untrack(() => cellEquals!.get(cell)!(cell.last, next))
		)
	) {
		if (journal !== undefined && !journal.has(cell)) journal.set(cell, cell.last);
		cell.last = next;
		if (signalMode & CHANGE_OBSERVED)
			reportChange(cell as unknown as SignalHandle<unknown>, 'change');
		if (cell.flags & REACTIVE_TRACKED_CELL) cellChannels.get(cell)!.revision++;
		const subs = cell.subs;
		if (subs !== undefined) {
			batchDepth++;
			try {
				propagate(subs, executionDepth !== 0);
				shallowPropagate(subs);
			} finally {
				batchDepth--;
			}
		}
	}
	if (batchDepth === 0 && (queueLength | effectLength) !== 0) flush();
}
Object.defineProperties(PlainCell.prototype, {
	valueOnly: { value: true },
	kind: { value: 'signal' },
	key: { value: '' },
	deps: { value: undefined },
	depsTail: { value: undefined },
});

/**
 * The open transaction's journal: each writable signal it changed, in the order
 * of its first change, and the value it had before. Writes leave their fast
 * paths while WRITE_JOURNALED is set, so only a transaction's writes record.
 */
let journal: Map<ScopedNode | PlainCell | PendingSlotLike, unknown> | undefined;
/**
 * While a transaction restores values a write compares by identity alone. An
 * undo or redo is an urgent write; a rollback also leaves pending values alone.
 */
let restoring: 0 | typeof RESTORING | typeof ROLLING_BACK = 0;
const RESTORING = 1;
const ROLLING_BACK = 2;

/**
 * Run `write` in a batch that records each signal it changes. If `write`
 * throws, or returns a promise, the signals it changed take back their values
 * before the batch ends, so no subscriber hears of them. A nested transaction's
 * changes join its parent's journal when it commits.
 */
export function signalTransaction<T>(write: () => T): SignalTransaction<T> {
	const parent = journal;
	const own: Map<ScopedNode | PlainCell | PendingSlotLike, unknown> = (journal = new Map());
	setSignalMode(WRITE_JOURNALED, true);
	startSignalBatch();
	try {
		let value: T;
		try {
			value = write();
			if (isThenable(value)) throw new TypeError(formatClientError(369));
		} catch (error) {
			// Restoring records nothing: what the parent had before is still current.
			journal = undefined;
			setSignalMode(WRITE_JOURNALED, false);
			restore([...own].reverse(), ROLLING_BACK);
			throw error;
		} finally {
			journal = parent;
			setSignalMode(WRITE_JOURNALED, parent !== undefined);
		}
		const changes: SignalChange[] = [];
		for (const [node, previous] of own) {
			if (parent !== undefined && !parent.has(node)) parent.set(node, previous);
			if (!(node instanceof PlainCell || isScopedNode(node))) continue;
			const next = node.last;
			if (!Object.is(previous, next))
				changes.push({ signal$: node as unknown as WritableSignal<unknown>, previous, next });
		}
		const undo = changes.map((change) => [change.signal$, change.previous] as const).reverse();
		const redo = changes.map((change) => [change.signal$, change.next] as const);
		return {
			value,
			changes,
			undo: () => signalBatch(() => restore(undo, RESTORING)),
			redo: () => signalBatch(() => restore(redo, RESTORING)),
		};
	} finally {
		endSignalBatch();
	}
}

/**
 * Write each live signal's value exactly, even one its `equals` finds equal,
 * and put back each pending transition value a rollback recorded, if its
 * transition is still pending.
 */
function restore(
	entries: readonly (readonly [unknown, unknown])[],
	mode: typeof RESTORING | typeof ROLLING_BACK,
): void {
	restoring = mode;
	try {
		for (const [key, value] of entries) {
			if (key instanceof PlainCell || isScopedNode(key)) {
				if (!key.owner.retired) key.set(() => value);
			} else {
				keyed!.restorePending(key as PendingSlotLike, value);
			}
		}
	} finally {
		restoring = 0;
	}
}

/** Each writable cell's own `equals`, made with the first one. */
let cellEquals: WeakMap<ScopedNode | PlainCell, SignalEquals<any>> | undefined;

/**
 * Compare a writable cell's writes with `equals` too, which only a rare cell
 * has. Its writes leave the fast path for the one that consults it, so the
 * common write never looks for one.
 */
export function setEquals<T>(cell: ScopedNode<T> | PlainCell<T>, equals: SignalEquals<T>): void {
	(cellEquals ??= new WeakMap()).set(cell, equals);
	cell.flags |= cell instanceof PlainCell ? REACTIVE_CUSTOM_EQUALS : REACTIVE_SLOW;
}

/** A keyless cell's revision and native read channel, once a render has read it. */
interface CellChannel {
	revision: number;
	readonly source: NativeReadSource;
}
function matchesKeylessNativeDomHandle(this: NativeReadSource, handle: unknown): boolean {
	return (
		(handle instanceof PlainCell &&
			handle[NATIVE_DOM_VALUE] === PlainCell.prototype[NATIVE_DOM_VALUE] &&
			cellChannels.get(handle)?.source === this) ||
		(handle instanceof PlainComputed &&
			handle[NATIVE_DOM_VALUE] === PlainComputed.prototype[NATIVE_DOM_VALUE] &&
			leanChannels.get(handle)?.source === this)
	);
}
const cellChannels = new WeakMap<PlainCell, CellChannel>();

function cellChannel(cell: PlainCell): CellChannel {
	let channel = cellChannels.get(cell);
	if (channel === undefined) {
		channel = {
			revision: 0,
			source: {
				__matchesNativeDomHandle: matchesKeylessNativeDomHandle,
				getVersion: () => channel!.revision,
				subscribe(notify, speculative) {
					assertAlive(cell.owner);
					return attachObserver(cell as unknown as ScopedNode, notify, true, speculative);
				},
				retired: () => cell.owner.retired,
			} as NativeReadSource & { __matchesNativeDomHandle: typeof matchesKeylessNativeDomHandle },
		};
		cellChannels.set(cell, channel);
		cell.flags |= REACTIVE_TRACKED_CELL;
	}
	return channel;
}

/**
 * A keyless cell's read while something presents other values or collects reads.
 * It is never staged, seeded or historical, so it presents its live value.
 */
/**
 * Its owner's retirement reaches a keyless cell's readers only through the cells
 * it lists: a cell joins the list when it gains its first reader.
 */
function holdCell(cell: PlainCell): void {
	cell.flags |= REACTIVE_LISTED;
	(cell.owner.heldCells ??= []).push(cell);
}

/**
 * A cell with no readers left has none for retirement to reach. Its entry goes
 * once released entries are half the list, so a long-lived scope lists at most
 * twice the cells something still reads.
 */
function releaseCell(cell: PlainCell): void {
	const owner = cell.owner;
	const held = owner.heldCells;
	// Retirement already let go of the whole list.
	if (held === undefined || ++owner.heldReleased * 2 < held.length) return;
	owner.heldReleased = 0;
	owner.heldCells = held.filter((entry) => {
		if (entry.subs !== undefined) return true;
		entry.flags &= ~REACTIVE_LISTED;
		return false;
	});
}

/**
 * Retire one keyless node, as its scope's retirement would: native views
 * invalidate once, public subscriptions end silently, and every other reader
 * recomputes, where reading it throws ScopeDisposedError. A cell moves to
 * `retired`, a retired owner of the same shape as its own, so its fast paths
 * keep their single check. A derived value lets go of its dependencies. Only
 * signal families call this, so applications without them ship none of it.
 * Callers batch, so the invalidations run once this returns.
 */
export function retireKeyless(
	node: PlainCell | PlainComputed,
	retired: GraphOwner,
	scopeKey: string,
): void {
	for (let link = node.subs; link !== undefined;) {
		const sub = link.sub;
		link = link.nextSub;
		if (!(sub instanceof SignalObserver)) continue;
		const notice = sub.native ? sub.notify : undefined;
		if (notice !== undefined && !queuedNotices.has(notice)) {
			queuedNotices.add(notice);
			queue[queueLength++] = notice;
		}
		stopObserver(sub);
	}
	const subs = node.subs;
	if (subs !== undefined) {
		propagate(subs, executionDepth !== 0);
		shallowPropagate(subs);
		while (node.subs) unlink(node.subs);
	}
	// Its observation has ended; a retained handle must not keep its hooks, or what they hold.
	if (watchDriver) watchDriver.retire(node);
	if (node instanceof PlainCell) {
		(node as { owner: GraphOwner }).owner = retired;
		node.last = undefined;
		return;
	}
	while (node.deps) unlink(node.deps, node);
	node.getter = () => {
		throw new ScopeDisposedError(scopeKey);
	};
	node.last = undefined;
	node.flags = (node.flags & REACTIVE_TRACKED_CELL) | REACTIVE_MUTABLE | REACTIVE_DIRTY;
}

/** The native read source a render took from a keyless derived value, if one did. */
export function leanSource(node: PlainComputed): NativeReadSource | undefined {
	return leanChannels.get(node)?.source;
}

/** A node's own `watched` hook, which a family keeps when it adds its own. */
export function watchedHook(node: ReactiveNode): WatchHook['watched'] | undefined {
	return watchDriver ? getHook(node)?.watched : undefined;
}

/**
 * Observer counts for the nodes a `watched` hook depends on: the hooked node and
 * everything that reads it, directly or through derived values. Every reader of a
 * counted node is counted too, from the link that makes it one. A node counts the
 * readers that observe: effects and subscribers, and counted derived values that
 * something observes. Derived values keep their links when unobserved, as scopes
 * own their producers, so this count rather than a link decides `watched`.
 * Installed by the first hook, so a graph without one checks a driver per link
 * and unlink and ships none of this.
 */
let watchDriver:
	| {
			link(dep: ReactiveNode, sub: ReactiveNode): void;
			/** null releases an observer already marked speculative. */
			unlink(dep: ReactiveNode, sub: ReactiveNode | null): void;
			retire(node: PlainCell | PlainComputed): void;
	  }
	| undefined;
// Only nodes with a lifecycle need a record. Other nodes just forward observation.
type Observation = WatchHook | number;
let observations: WeakMap<ReactiveNode, Observation>;

interface WatchHook {
	count: number;
	watched: () => void | (() => void);
	cleanup: void | (() => void);
	generation: number;
	active: boolean;
}

export function setWatched(
	node: ScopedNode | PlainCell | PlainComputed,
	watched: WatchHook['watched'],
): void {
	if (!watchDriver) {
		observations = new WeakMap();
		pendingHooks = [];
		watchDriver = {
			link(dep, sub) {
				const state = observations.get(dep);
				if (state !== undefined) countLink(dep, sub, state);
			},
			unlink(dep, sub) {
				const state = observations.get(dep);
				if (state !== undefined && (sub === null || observing(sub)))
					changeObservation(dep, state, -1);
			},
			// Its readers keep their links until they next read it; its observation ends now.
			retire(cell) {
				const hook = getHook(cell);
				if (hook) {
					stopWatch(hook);
					observations.set(cell, hook.count);
				}
			},
		};
	}
	countObservers(node, { count: 0, watched, cleanup: undefined, generation: 0, active: false });
}

function getHook(node: ReactiveNode): WatchHook | undefined {
	const state = observations.get(node);
	return typeof state === 'object' ? state : undefined;
}

function observing(sub: ReactiveNode): boolean {
	const state = observations.get(sub);
	const count = typeof state === 'object' ? state.count : state;
	return count !== undefined
		? count > 0
		: (sub.flags & (REACTIVE_MUTABLE | REACTIVE_WATCHING | REACTIVE_SPECULATIVE)) ===
				REACTIVE_WATCHING;
}

/** Starts counting a node's observers; none of its own dependencies is counted yet. */
function countObservers(node: ReactiveNode, hook?: WatchHook): void {
	let count = 0;
	for (let link = node.subs; link; link = link.nextSub) {
		const sub = link.sub;
		if (sub.flags & REACTIVE_MUTABLE && !observations.has(sub)) countObservers(sub);
		if (observing(sub)) count++;
	}
	if (hook) hook.count = count;
	observations.set(node, hook ?? count);
	if (count && hook) startWatch(node, hook);
}

function countLink(dep: ReactiveNode, sub: ReactiveNode, state: Observation): void {
	if (sub.flags & REACTIVE_MUTABLE && !observations.has(sub)) countObservers(sub);
	if (!observing(sub)) return;
	// A computation has not consumed its newly linked dependency yet. Hide that
	// edge from recursive-write checks while setup publishes its initial value;
	// writes to dependencies consumed earlier still invalidate the computation.
	const tail = sub.depsTail;
	const hide = !!(sub.flags & REACTIVE_RECURSED_CHECK) && tail?.dep === dep;
	if (hide) sub.depsTail = tail!.prevDep;
	try {
		changeObservation(dep, state, 1);
	} finally {
		if (hide && (tail!.prevDep ? tail!.prevDep.nextDep === tail : sub.deps === tail))
			sub.depsTail = tail;
	}
	// Starting a source can synchronously invalidate the derived value being
	// linked. Finish that read before its new observer sees the value.
	if (dep.flags & (REACTIVE_DIRTY | REACTIVE_PENDING) && !(dep.flags & REACTIVE_RECURSED_CHECK)) {
		if (dep instanceof PlainComputed) refreshLean(dep);
		else if (isScopedNode(dep)) keyed!.refresh(dep);
	}
}

// Nested transitions append their own hooks after those of the calling transition.
let pendingHooks: ReactiveNode[];

/** Count the whole dependency tree before a hook can synchronously rewire it. */
function changeObservation(node: ReactiveNode, state: Observation, delta: 1 | -1): void {
	const start = pendingHooks.length;
	try {
		collectHooks(node, state, delta);
		for (let i = start; i < pendingHooks.length; i++) {
			const hooked = pendingHooks[i]!;
			const hook = getHook(hooked);
			if (!hook) continue;
			if (delta === 1 && hook.count > 0) startWatch(hooked, hook);
			else if (delta === -1 && hook.count === 0) stopWatch(hook);
		}
	} finally {
		// Popping keeps the small backing store reusable. Truncate after a wide traversal.
		if (pendingHooks.length > 64) pendingHooks.length = start;
		else while (pendingHooks.length > start) pendingHooks.pop();
	}
}

/** Only a first or last reader changes its sources' counts. Start sources first, stop them last. */
function collectHooks(node: ReactiveNode, state: Observation, delta: 1 | -1): void {
	const hasHook = typeof state === 'object';
	const count = (hasHook ? state.count : state) + delta;
	if (hasHook) state.count = count;
	else observations.set(node, count);
	if (count !== (delta === 1 ? 1 : 0)) return;
	if (delta === -1 && hasHook) pendingHooks.push(node);
	for (let link = node.deps; link; link = link.nextDep) {
		const depState = observations.get(link.dep);
		if (depState !== undefined) collectHooks(link.dep, depState, delta);
	}
	if (delta === 1 && hasHook) pendingHooks.push(node);
}

function startWatch(node: ReactiveNode, hook: WatchHook): void {
	if (hook.active) return;
	hook.active = true;
	const generation = ++hook.generation;
	const cleanup = runHook(hook.watched);
	if (hook.generation === generation && observations.get(node) === hook) hook.cleanup = cleanup;
	else if (typeof cleanup === 'function') runHook(cleanup);
}

function stopWatch(hook: WatchHook): void {
	if (!hook.active) return;
	hook.active = false;
	hook.generation++;
	const cleanup = hook.cleanup;
	hook.cleanup = undefined;
	if (typeof cleanup === 'function') runHook(cleanup);
}

/**
 * A hook runs inside another node's link or unlink, so its error is reported rather
 * than thrown: the read, stop or disposal that reached it still completes.
 */
function runHook(hook: () => void | (() => void)): void | (() => void) {
	// A committed observer can gain or lose a dependency while a derived value
	// is being checked. Its lifecycle is imperative even inside that pure read.
	const previousNode = activeNode;
	const previousDepth = pureDepth;
	const previousHook = runningWatchHook;
	activeNode = undefined;
	pureDepth = 0;
	runningWatchHook = true;
	try {
		return untrack(hook);
	} catch (error) {
		const report = (globalThis as { reportError?: (error: unknown) => void }).reportError;
		if (typeof report === 'function') report(error);
		else console.error(error);
	} finally {
		activeNode = previousNode;
		pureDepth = previousDepth;
		runningWatchHook = previousHook;
	}
}

function readCellOther<T>(cell: PlainCell<T>): T {
	assertAlive(cell.owner);
	const reader = activeNode;
	if (reader !== undefined) {
		linkDependency(cell, reader, trackingCycle);
		if (cell.owner !== reader.owner) addOwner(cell.owner);
	}
	if (getNativeReadObserver()) {
		const channel = cellChannel(cell);
		reportNativeRead(channel.source, channel.revision);
	}
	return cell.last;
}

/**
 * A keyless derived value, `scope.derived$(null, compute)`: the shape of
 * alien-signals' computed, joined to the same graph. It belongs to no scope:
 * it keeps no provenance and is never serialized, inspected, reseeded or staged
 * by a transition. A throw is rethrown to its readers until a dependency
 * changes; a thrown thenable is rethrown and computed again on the next read.
 */
export class PlainComputed<T = any> implements ReactiveNode {
	// Assigned in the constructor, as PlainCell's are.
	declare deps: ReactiveNode['deps'];
	declare depsTail: ReactiveNode['depsTail'];
	declare subs: ReactiveNode['subs'];
	declare subsTail: ReactiveNode['subsTail'];
	declare flags: ReactiveFlags;
	declare last: unknown;
	declare getter: () => T;
	declare readonly valueOnly: true;
	declare readonly kind: 'derived';
	declare readonly key: '';
	declare readonly owner: undefined;
	declare readonly plain: undefined;

	constructor(getter: () => T) {
		this.flags = REACTIVE_MUTABLE | REACTIVE_DIRTY;
		this.subs = undefined;
		this.subsTail = undefined;
		this.deps = undefined;
		this.depsTail = undefined;
		this.last = undefined;
		this.getter = getter;
	}

	get [SIGNAL_HANDLE](): true {
		return true;
	}

	get(): T {
		if (
			this.flags &
			(REACTIVE_DIRTY | REACTIVE_PENDING | REACTIVE_RECURSED_CHECK | REACTIVE_FAILED)
		)
			refreshLean(this, true);
		const reader = activeNode;
		if (reader !== undefined) linkDependency(this, reader, trackingCycle);
		if ((signalMode & READ_OBSERVED) !== 0) reportLeanRead(this);
		return this.last as T;
	}

	latest(): T | undefined;
	latest<F>(fallback: F): T | F;
	latest<F>(fallback?: F): T | F | undefined {
		try {
			refreshLean(this);
		} catch {
			return fallback;
		}
		return this.last as T;
	}

	snapshot(): SignalSnapshot<T> {
		try {
			refreshLean(this);
		} catch (error) {
			return Object.freeze(
				isThenable(error) ? pendingState(error).snapshot : errorState(error).snapshot,
			) as SignalSnapshot<T>;
		}
		return Object.freeze(readyState(this.last as T).snapshot);
	}

	/** Subscriptions do not deliver an initial notification. */
	subscribe(notify: () => void): () => void {
		assertWritable();
		if (typeof notify !== 'function') throw new TypeError(formatClientError(165));
		return attachObserver(this as unknown as ScopedNode, notify, false);
	}

	[SIGNAL_BINDING_READ](): T {
		const observer = setNativeReadObserver(null);
		try {
			return this.get();
		} finally {
			setNativeReadObserver(observer);
		}
	}

	[SIGNAL_BINDING_SUBSCRIBE](
		notify: () => void,
		_onRetire?: () => void,
		speculative?: boolean,
	): NativeReadSubscription {
		return attachObserver(this as unknown as ScopedNode, notify, true, speculative);
	}

	[SIGNAL_BINDING_IDENTITY]() {
		return { scope: 'instance' as const, nodeKey: '' };
	}

	[NATIVE_DOM_VALUE](): T {
		return this.get();
	}
}
Object.defineProperties(PlainComputed.prototype, {
	valueOnly: { value: true },
	kind: { value: 'derived' },
	key: { value: '' },
	owner: { value: undefined },
	plain: { value: undefined },
});

const leanChannels = new WeakMap<PlainComputed, CellChannel>();

function leanChannel(node: PlainComputed): CellChannel {
	let channel = leanChannels.get(node);
	if (channel === undefined) {
		channel = {
			revision: 0,
			source: {
				__matchesNativeDomHandle: matchesKeylessNativeDomHandle,
				// Not told of a change, so while one may have reached it no earlier read is reusable.
				getVersion: () =>
					node.flags & (REACTIVE_DIRTY | REACTIVE_PENDING) ? NaN : channel!.revision,
				subscribe: (notify, speculative) =>
					attachObserver(node as unknown as ScopedNode, notify, true, speculative),
			} as NativeReadSource & { __matchesNativeDomHandle: typeof matchesKeylessNativeDomHandle },
		};
		leanChannels.set(node, channel);
		node.flags |= REACTIVE_TRACKED_CELL;
	}
	return channel;
}

function reportLeanRead(node: PlainComputed): void {
	const channel = leanChannel(node);
	reportNativeRead(channel.source, channel.revision);
}

/** Bring a keyless derived value up to date, or rethrow what its computation threw. */
function refreshLean(node: PlainComputed, trackFailure = false): void {
	const flags = node.flags;
	if (flags & REACTIVE_RECURSED_CHECK) throw new SignalCycleError('');
	if (flags & (REACTIVE_DIRTY | REACTIVE_PENDING)) {
		let dirty = (flags & REACTIVE_DIRTY) !== 0;
		if (!dirty) {
			pureDepth++;
			try {
				dirty = checkDirty(node.deps!, node);
			} finally {
				pureDepth--;
			}
			if (!dirty) node.flags = flags & ~REACTIVE_PENDING;
		}
		if (dirty && updateLean(node) && node.subs !== undefined) shallowPropagate(node.subs);
	}
	if (node.flags & REACTIVE_FAILED) {
		if (trackFailure) {
			if (activeNode !== undefined) linkDependency(node, activeNode, trackingCycle);
			if ((signalMode & READ_OBSERVED) !== 0) reportLeanRead(node);
		}
		if (node.flags & REACTIVE_FAILED) throw node.last;
	}
}

/** Only a watched write that invalidates an active computation needs stabilization. */
function stabilizeLean(node: PlainComputed, previous: unknown): boolean {
	let rounds = 0;
	do {
		if (++rounds > 100) throw new SignalCycleError('');
		node.last = previous;
		recomputeLean(node, true);
	} while (node.flags & REACTIVE_RECURSED);
	return (node.flags & REACTIVE_FAILED) !== 0 || !same(previous, node.last);
}

/** Compute a keyless derived value, in the shape of alien-signals' update. */
function updateLean(node: PlainComputed): boolean {
	// A tracked channel, an earlier failure or a render collecting reads takes the
	// wrapper, which keeps this common recomputation small enough to inline.
	return node.flags & (REACTIVE_FAILED | REACTIVE_TRACKED_CELL) ||
		signalMode & (READ_OBSERVED | CHANGE_OBSERVED)
		? updateLeanTracked(node)
		: recomputeLean(node);
}

/** Recompute; a throw is held as the value, flagged REACTIVE_FAILED. */
function recomputeLean(node: PlainComputed, inStabilization?: boolean): boolean {
	node.depsTail = undefined;
	node.flags = REACTIVE_MUTABLE | REACTIVE_RECURSED_CHECK;
	const previousNode = activeNode;
	// Being the active node rejects writes (assertWritable) and keeps no provenance (addOwner).
	activeNode = node;
	let value: unknown;
	try {
		++trackingCycle;
		value = node.getter();
	} catch (error) {
		value = error;
		// A thrown thenable is computed again once its readers retry.
		node.flags |= isThenable(error) ? REACTIVE_FAILED | REACTIVE_DIRTY : REACTIVE_FAILED;
	} finally {
		activeNode = previousNode;
		const tail = node.depsTail as Link | undefined;
		const obsolete = tail ? tail.nextDep : node.deps;
		if (obsolete) unlinkObsolete(node, obsolete);
		node.flags &= ~REACTIVE_RECURSED_CHECK;
	}
	const previous = node.last;
	const changed =
		(node.flags & REACTIVE_FAILED) !== 0 ||
		!(previous === value
			? value !== 0 || 1 / (previous as number) === 1 / (value as number)
			: value !== value && previous !== previous);
	if (changed) node.last = value;
	return node.flags & REACTIVE_RECURSED && !inStabilization
		? stabilizeLean(node, previous)
		: changed;
}

function updateLeanTracked(node: PlainComputed): boolean {
	const kept = node.flags & (REACTIVE_FAILED | REACTIVE_TRACKED_CELL);
	// After a failure any result is a change: the held error equals no value.
	if (kept & REACTIVE_FAILED) node.last = NO_FAILURE;
	// A render collecting reads must not see this computation's own reads.
	const observer = (signalMode & READ_OBSERVED) !== 0 ? setNativeReadObserver(null) : null;
	let changed: boolean;
	try {
		changed = recomputeLean(node);
	} finally {
		if (observer !== null) setNativeReadObserver(observer);
		node.flags |= kept & REACTIVE_TRACKED_CELL;
	}
	if (changed && kept & REACTIVE_TRACKED_CELL) leanChannels.get(node)!.revision++;
	if (changed && signalMode & CHANGE_OBSERVED)
		reportChange(node as unknown as SignalHandle<unknown>, 'change');
	return changed;
}

/**
 * A scope's effect: a computation run for what it does, not for a value. It runs
 * at once, tracking what it reads, and again in the batch's delivery once any of
 * that changes, after its previous run's cleanup. Its runs may write signals.
 */
export class EffectNode implements ReactiveNode {
	// Assigned in the constructor, as PlainCell's are.
	declare deps: ReactiveNode['deps'];
	declare depsTail: ReactiveNode['depsTail'];
	declare flags: ReactiveFlags;
	declare cleanup: (() => void) | undefined;
	/** Neighbours in its scope's ring of effects, which the scope stops when it retires. */
	declare prev: EffectNode | undefined;
	declare next: EffectNode | undefined;
	declare run: (() => void | (() => void)) | undefined;
	declare readonly owner: undefined;

	constructor(run: (() => void | (() => void)) | undefined) {
		this.flags = REACTIVE_WATCHING;
		this.run = run;
		this.cleanup = undefined;
		this.deps = undefined;
		this.depsTail = undefined;
		this.prev = undefined;
		this.next = undefined;
	}
}
// An effect keeps no provenance: its reads see no owner of its own.
Object.defineProperty(EffectNode.prototype, 'owner', { value: undefined });

/** A ring of effects, entered through `head`, a sentinel that never runs. */
export function addEffect(head: EffectNode, effect: EffectNode): void {
	const last = head.prev!;
	effect.prev = last;
	effect.next = head;
	last.next = effect;
	head.prev = effect;
}

export function effectRing(): EffectNode {
	const head = new EffectNode(undefined);
	head.prev = head.next = head;
	return head;
}

function queueEffect(effect: EffectNode): void {
	if (effect.flags & REACTIVE_QUEUED) return;
	effect.flags |= REACTIVE_QUEUED;
	effectQueue[effectLength++] = effect;
}

/** Run an effect whose dependencies a change reached, if one of them did change. */
function runEffect(effect: EffectNode): void {
	// A stopped effect can still sit in the queue.
	if (effect.run === undefined) return;
	// Delivered, it can be queued again even if its cleanup or check throws below.
	const flags = (effect.flags &= ~REACTIVE_QUEUED);
	if (!(flags & REACTIVE_DIRTY)) {
		if (!(flags & REACTIVE_PENDING) || effect.deps === undefined) {
			effect.flags = REACTIVE_WATCHING;
			return;
		}
		// Bringing dependencies up to date is a read, as refresh() makes it.
		let dirty: boolean;
		pureDepth++;
		try {
			dirty = checkDirty(effect.deps, effect);
		} catch (error) {
			if (error instanceof ScopeDisposedError) return stopEffect(effect);
			throw error;
		} finally {
			pureDepth--;
		}
		if (!dirty) {
			effect.flags = REACTIVE_WATCHING;
			return;
		}
	}
	executeEffect(effect);
}

export function executeEffect(effect: EffectNode): void {
	const run = effect.run;
	if (run === undefined) return;
	const cleanup = effect.cleanup;
	if (cleanup !== undefined) {
		// Watching again first: if the cleanup throws, the next change still reaches it.
		effect.flags = REACTIVE_WATCHING;
		effect.cleanup = undefined;
		untrack(cleanup);
	}
	effect.depsTail = undefined;
	effect.flags = REACTIVE_WATCHING | REACTIVE_RECURSED_CHECK;
	const previousNode = activeNode;
	activeNode = effect;
	executionDepth++;
	try {
		++trackingCycle;
		const next = run();
		if (typeof next === 'function') effect.cleanup = next;
	} catch (error) {
		// An owner it read has retired: like a public subscription, the effect ends silently.
		if (!(error instanceof ScopeDisposedError)) throw error;
		effect.run = undefined;
	} finally {
		executionDepth--;
		activeNode = previousNode;
		effect.flags &= ~REACTIVE_RECURSED_CHECK;
		const tail = effect.depsTail as Link | undefined;
		let obsolete = tail ? tail.nextDep : effect.deps;
		while (obsolete) obsolete = unlink(obsolete, effect);
	}
	if (effect.run === undefined) stopEffect(effect);
}

/** Stop an effect: it runs its last cleanup and never runs again. */
export function stopEffect(effect: EffectNode): void {
	effect.run = undefined;
	const prev = effect.prev;
	if (prev !== undefined) {
		prev.next = effect.next;
		effect.next!.prev = prev;
		effect.prev = effect.next = undefined;
	}
	while (effect.deps) unlink(effect.deps, effect);
	effect.flags = REACTIVE_NONE;
	const cleanup = effect.cleanup;
	effect.cleanup = undefined;
	if (cleanup !== undefined) untrack(cleanup);
}

/** A retiring owner keeps the observer in its set, which it then clears at once. */
export function stopObserver(observer: SignalObserver, retiring?: boolean): void {
	const node = observer.node;
	if (!node) return;
	dequeue(observer);
	if (!retiring) node.owner?.observers.delete(observer);
	while (observer.deps) unlink(observer.deps, observer);
	// Cleared last, so a stop the native stack interrupts can run again.
	observer.flags = REACTIVE_NONE;
	observer.node = undefined;
	observer.notify = undefined;
	observer.previous = undefined;
	observer.value = undefined;
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
	dequeue(view);
	// A retired view never evaluates again. Its readers still wake when the
	// thenable it threw settles, without that thenable retaining the view.
	if (view.wakeup) view.wakeup.node = undefined;
	view.compute = undefined;
	view.invalidateAttempt = undefined;
	while (view.deps) unlink(view.deps, view);
	view.flags = REACTIVE_MUTABLE | REACTIVE_WATCHING | REACTIVE_SLOW;
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
	dequeue(view);
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
	retirement = { snapshot: new RetiredSnapshot(owner.scopeKey) };
	try {
		for (const observer of owner.observers) {
			// Public subscriptions end silently. Native views must invalidate once so
			// a mounted consumer cannot keep displaying a retired owner's values.
			const notice = observer.native ? observer.notify : undefined;
			if (notice !== undefined && !queuedNotices.has(notice)) {
				queuedNotices.add(notice);
				queue[queueLength++] = notice;
			}
			stopObserver(observer, true);
		}
		// Deleting each observer while iterating would rehash the set as it shrinks.
		owner.observers.clear();
		revokeRetainedValues(owner);
		for (const node of nodes) {
			if (node.pending !== undefined) pendingSignals!.drop(node.pending);
			dequeue(node);
			node.wakeup?.resolve();
			node.wakeup = undefined;
			node.revision++;
			retireState(node);
			node.compute = undefined;
			node.plain = undefined;
			node.invalidateAttempt = undefined;
			node.retryRequest = undefined;
			if (node.subs) {
				propagate(node.subs, executionDepth !== 0);
				shallowPropagate(node.subs);
			}
			// Readers first, so a watched node stops before its sources do.
			while (node.subs) unlink(node.subs);
			while (node.deps) unlink(node.deps, node);
			node.flags = REACTIVE_NONE;
		}
		// A keyless cell's readers learn of it as they would of a keyed node: their next
		// read of it throws ScopeDisposedError, which stops an effect.
		const held = owner.heldCells;
		if (held !== undefined) {
			owner.heldCells = undefined;
			for (const cell of held) {
				if (watchDriver) watchDriver.retire(cell);
				const subs = cell.subs;
				if (subs !== undefined) {
					propagate(subs, executionDepth !== 0);
					shallowPropagate(subs);
				}
			}
		}
	} finally {
		retirement = previous;
	}
}

// Full scopes install their keyed operations when their engine loads. Keyless
// nodes use the same dependency links, delivery queues and transaction journal.
let keyed:
	| {
			Node: typeof ScopedNode;
			notify: typeof notifyScoped;
			update: typeof updateScoped;
			updatePlain: typeof updatePlain;
			refresh: typeof refresh;
			observe: typeof observeScoped;
			restorePending: typeof restorePending;
	  }
	| undefined;

function isScopedNode(node: unknown): node is ScopedNode {
	return keyed !== undefined && node instanceof keyed.Node;
}

// Computed class keys are observable operations to bundlers. Install the keyed
// node's symbol protocol together with its engine, allowing a core consumer to
// drop the entire class.
function installKeyedBindings(prototype: ScopedNode): void {
	Object.defineProperty(prototype, SIGNAL_HANDLE, { get: () => true });
	prototype[SIGNAL_BINDING_READ] = function () {
		return readSignalBinding(this);
	};

	prototype[SIGNAL_BINDING_SUBSCRIBE] = function (
		notify: () => void,
		onRetire?: () => void,
		speculative?: boolean,
	): NativeReadSubscription {
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
			speculative,
		);
	};

	prototype[SIGNAL_BINDING_RETIRED] = function (): boolean {
		return this.owner.retired;
	};

	prototype[SIGNAL_BINDING_IDENTITY] = function () {
		return { scope: 'instance' as const, nodeKey: this.key };
	};

	prototype[NATIVE_DOM_VALUE] = function () {
		return this.get();
	};
}

export function installKeyedGraph(): void {
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		GraphReadSource.prototype.inspect = function (this: GraphReadSource) {
			return this.canonicalSource()?.inspect!() ?? inspectNativeNode(this.node, this.read);
		};
	installKeyedBindings(ScopedNode.prototype);
	keyed = {
		Node: ScopedNode,
		notify: notifyScoped,
		update: updateScoped,
		updatePlain,
		refresh,
		observe: observeScoped,
		restorePending,
	};
	registerGraphBridge({
		ScopedNode,
		graph: { unlink, propagate, shallowPropagate },
		historical: () => historicalReader !== undefined,
		assertAlive,
		link: (from, to) => {
			linkDependency(from, to, ++trackingCycle);
		},
		removeQueued: dequeue,
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
}

function restorePending(slot: PendingSlotLike, value: unknown): void {
	if (slot.node.pending === slot && !slot.node.owner.retired)
		publishNode(slot.shadow!, readyState(value));
}
