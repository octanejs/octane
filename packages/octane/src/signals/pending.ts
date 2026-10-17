import { formatClientError } from '../error-codes.client.generated.js';
import type { DerivedBinding } from './computations.js';
import type { ScopeImpl } from './engine.js';
import type {
	CandidateProducer,
	CandidateProducerReceipt,
	NodeState,
	ScopedNode,
	SignalObserver,
} from './graph.js';
import {
	REACTIVE_DIRTY,
	REACTIVE_MUTABLE,
	REACTIVE_PENDING,
	REACTIVE_WATCHING,
} from './graph-flags.js';
import {
	NATIVE_TRANSITION_CONSUMER,
	SIGNAL_DEPENDENT_NODE,
	type NativeReadSource,
	type NativeTransitionNotify,
	type SignalDependencyNotify,
} from './read-protocol.js';
import {
	candidateHooks,
	CandidateUnsupportedError,
	committedSignals,
	graphBridge as graph,
	setPendingWorld,
	withCommittedSignals,
	type CandidateContext,
	type PendingSignals,
	type PendingSlotLike,
} from './transition-state.js';

// Signal writes inside a transition keep fork semantics on the renderer's
// update-queue model (#2043). A node written or derived inside a transition
// batch keeps its committed state and at most one pending slot, tagged with
// that batch. Committed readers, subscriptions and DOM bindings keep reading
// the committed state; a render that folds the batch, and the transition's own
// synchronous callback, read the slot's shadow node instead. A batch that
// touches a node already pending in another batch entangles with it, as
// transitions that update one hook queue do, so a slot only ever presents one
// world. An urgent write updates committed state and re-applies on top of the
// pending value (React's rebase). When the batch finishes, its slots promote
// into committed state and their readers hear of it once; a slot whose owner
// retires is dropped.

/**
 * What the current read sees: undefined asks the renderer (pendingSignals.host);
 * null is committed state, inside a committed computation; a batch is the one
 * a shadow computes for.
 */
let world: object | null | undefined;
let live = 0;

function inWorld<T>(batch: object, callback: () => T): T {
	const previous = world;
	world = batch;
	try {
		return callback();
	} finally {
		world = previous;
	}
}

class PendingSlot implements PendingSlotLike, CandidateContext {
	/** The private node presenting the pending state; a computation forks it on its first pending read. */
	shadow: ScopedNode | undefined = undefined;
	producer: CandidateProducer | undefined = undefined;
	/** Installing into committed state with the rest of its batch (promoteSlots). */
	promoting = false;
	dead = false;

	constructor(
		readonly node: ScopedNode,
		public batch: object,
	) {}

	run<T>(callback: () => T): T {
		return inWorld(this.batch, callback);
	}

	resolve<T>(node: ScopedNode<T>): ScopedNode<T> {
		return this.run(() => resolve(node));
	}

	canonical<T>(node: ScopedNode<T>): ScopedNode<T> {
		return canonical(node);
	}
}

/**
 * A shadow's native read channel. A render that read the pending state keeps
 * its witness valid once the slot promotes, until the committed node changes
 * again; a dropped slot's witness is stale. Subscriptions move with the
 * shadow's readers (release).
 */
class PendingSource implements NativeReadSource {
	private committed = NaN;
	private presented = NaN;

	constructor(
		private readonly slot: PendingSlot,
		private readonly shadow: ScopedNode,
	) {}

	getVersion(): number {
		const slot = this.slot;
		if (!slot.dead) return pending.host!.visible(slot.batch) === false ? NaN : this.shadow.revision;
		return slot.node.revision === this.committed ? this.presented : NaN;
	}

	subscribe(notify: () => void): () => void {
		return graph.attachObserver(this.slot.dead ? this.slot.node : this.shadow, notify, true);
	}

	retired(): boolean {
		return this.slot.node.owner.retired;
	}

	settle(installed: boolean): void {
		if (!installed) return;
		this.committed = this.slot.node.revision;
		this.presented = this.shadow.revision;
	}
}

function isShadow(node: ScopedNode): boolean {
	const slot = node.pending as PendingSlot | undefined;
	return slot !== undefined && slot.shadow === node;
}

function canonical<T>(node: ScopedNode<T>): ScopedNode<T> {
	const slot = node.pending as PendingSlot | undefined;
	return slot !== undefined && slot.shadow === node ? slot.node : node;
}

function sees(slot: PendingSlot): boolean {
	const host = pending.host!;
	if (world !== undefined && world !== null && host.root(world) === host.root(slot.batch))
		return true;
	return host.visible(slot.batch) === true;
}

function sameRoot(a: object, b: object): boolean {
	const host = pending.host!;
	return host.root(a) === host.root(b);
}

function createSlot(node: ScopedNode, batch: object): PendingSlot {
	const slot = new PendingSlot(node, batch);
	node.pending = slot;
	if (live++ === 0) setPendingWorld(true);
	pending.host!.hold(batch, slot);
	return slot;
}

/** The slot's shadow, starting from committed state. Every graph owner is a scope (engine.ts). */
function fork(slot: PendingSlot): ScopedNode {
	const node = slot.node;
	const owner = node.owner as ScopeImpl;
	const registered = owner.nodes.get(node.key) === node;
	// A render's private declaration view forks like the cell it presents.
	const view = registered ? undefined : graph.declarationViewFork(node);
	if ((!registered && view === undefined) || owner.readBarrier || owner.frames?.size)
		throw new CandidateUnsupportedError(formatClientError(135));
	const shadow = new graph.ScopedNode(owner, node.key, node.kind);
	shadow.pending = slot;
	shadow.state = node.state;
	shadow.last = node.last;
	shadow.lastState = node.lastState;
	shadow.hasLast = node.hasLast;
	slot.shadow = shadow;
	try {
		if (view !== undefined) slot.producer = view(shadow, slot);
		else {
			const resource = owner.resources?.get(node);
			const binding = resource === undefined ? owner.derivedBindings?.get(node) : undefined;
			if (resource !== undefined) slot.producer = candidateHooks.resource!.call(resource, shadow);
			else if (binding !== undefined) {
				// A scalar binding forks itself; a general derived binding has a producer.
				const forkBinding = binding.forkCandidate ?? candidateHooks.derived;
				if (!forkBinding) throw new CandidateUnsupportedError(formatClientError(136));
				slot.producer = forkBinding.call(binding as DerivedBinding<unknown>, shadow, slot);
			} else shadow.compute = node.compute;
		}
	} catch (error) {
		release(slot, false);
		throw error;
	}
	return shadow;
}

/**
 * Mark what reads a newly pending writable: computations become pending in the
 * same batch, or entangle it with theirs, and a rendered reader renders with it.
 */
function enlist(start: ScopedNode, batch: object): void {
	const host = pending.host!;
	const visited = new Set<ScopedNode>([start]);
	const stack = [start];
	const visit = (node: ScopedNode): void => {
		if (visited.has(node)) return;
		visited.add(node);
		const slot = node.pending as PendingSlot | undefined;
		if (slot === undefined) createSlot(node, batch);
		else {
			if (!sameRoot(slot.batch, batch)) host.entangle(slot.batch, batch);
			// A shadow that read the committed node reads its pending state now.
			if (slot.shadow === node) {
				graph.invalidateNode(node);
				return;
			}
		}
		stack.push(node);
	};
	while (stack.length !== 0) {
		const node = stack.pop()!;
		for (let link = node.subs; link !== undefined; link = link.nextSub) {
			const sub = link.sub;
			if (sub instanceof graph.ScopedNode) {
				visit(sub);
				continue;
			}
			const notify = (sub as SignalObserver).notify as
				(NativeTransitionNotify & SignalDependencyNotify) | undefined;
			if (notify === undefined) continue;
			const dependent = notify[SIGNAL_DEPENDENT_NODE];
			if (dependent !== undefined) visit(dependent);
			const block = notify[NATIVE_TRANSITION_CONSUMER];
			if (block !== undefined) host.consume(batch, block);
		}
	}
}

function evaluateUpdater(batch: object, value: (previous: unknown) => unknown, previous: unknown) {
	return inWorld(batch, () => graph.untrack(() => graph.pure(() => value(previous))));
}

function write(node: ScopedNode, value: unknown, batch: object): void {
	let slot = node.pending as PendingSlot | undefined;
	const previous = graph.strictValue(graph.refreshNode(slot?.shadow ?? node), node.key);
	// Functional updates apply in order on top of the pending value, and read
	// the world of the batch that queued them.
	const next =
		typeof value === 'function'
			? evaluateUpdater(batch, value as (previous: unknown) => unknown, previous)
			: value;
	graph.signalBatch(() => {
		if (slot === undefined) {
			// An equal write queues nothing.
			if (Object.is(previous, next)) return;
			slot = createSlot(node, batch);
			fork(slot);
			enlist(node, batch);
		} else if (!sameRoot(slot.batch, batch)) pending.host!.entangle(slot.batch, batch);
		graph.publishNode(slot.shadow!, graph.readyState(next));
	});
}

function rebase(node: ScopedNode, value: unknown): void {
	const slot = node.pending as PendingSlot;
	const shadow = slot.shadow!;
	const next =
		typeof value === 'function'
			? evaluateUpdater(
					slot.batch,
					value as (previous: unknown) => unknown,
					graph.strictValue(graph.refreshNode(shadow), node.key),
				)
			: value;
	graph.publishNode(shadow, graph.readyState(next));
}

function resolve<T>(node: ScopedNode<T>): ScopedNode<T> {
	if (committedSignals !== 0 || world === null || graph.historical()) return node;
	let slot = node.pending as PendingSlot | undefined;
	if (slot === undefined) {
		if (node.kind === 'signal') return node;
		// Evaluating a computation marks it pending when it reads pending state (leave).
		graph.refreshNode(node);
		slot = node.pending as PendingSlot | undefined;
		if (slot === undefined) return node;
	}
	if (slot.shadow === node || !sees(slot)) return node;
	// A shadow that reads another batch's pending state commits with it.
	if (world !== undefined && !sameRoot(world, slot.batch))
		pending.host!.entangle(world, slot.batch);
	return (slot.shadow ?? fork(slot)) as ScopedNode<T>;
}

function enter(node: ScopedNode): unknown {
	const previous = world;
	const slot = node.pending as PendingSlot | undefined;
	// A committed computation reads committed state, whoever reads it. A render's
	// declaration view presents that render, so it keeps the reader's world.
	world =
		slot !== undefined && slot.shadow === node
			? slot.batch
			: graph.isDeclarationView(node)
				? previous
				: null;
	return previous;
}

function leave(previous: unknown, node: ScopedNode): void {
	world = previous as object | null | undefined;
	if (isShadow(node)) return;
	// A computation that read pending state is pending in the same batch.
	for (let link = node.deps; link !== undefined; link = link.nextDep) {
		const dependency = link.dep as ScopedNode;
		const slot = dependency.pending as PendingSlot | undefined;
		if (slot === undefined || slot.shadow === dependency) continue;
		const own = node.pending as PendingSlot | undefined;
		if (own === undefined) createSlot(node, slot.batch);
		else if (!sameRoot(own.batch, slot.batch)) pending.host!.entangle(own.batch, slot.batch);
	}
}

function hides(node: ScopedNode): boolean {
	if (committedSignals !== 0 || world === null) return false;
	const slot = node.pending as PendingSlot | undefined;
	return slot !== undefined && slot.shadow !== node && sees(slot);
}

/** Move a released shadow's remaining readers to its committed node. */
function moveReaders(slot: PendingSlot): void {
	const { node, shadow } = slot;
	for (let link = shadow!.subs; link !== undefined;) {
		const next = link.nextSub;
		const sub = link.sub;
		graph.graph.unlink(link, sub);
		if (sub instanceof graph.ScopedNode) {
			// A shadow installing with this one already reads the committed node.
			// Any other computes again; a view keeps reading the node.
			if (!isShadow(sub)) graph.link(node, sub);
			else if (!(sub.pending as PendingSlot).promoting) graph.invalidateNode(sub);
		} else {
			const observer = sub as SignalObserver;
			observer.node = node;
			graph.link(node, observer);
		}
		link = next;
	}
}

function release(slot: PendingSlot, installed: boolean): void {
	if (slot.dead) return;
	slot.dead = true;
	const { node, shadow } = slot;
	if (node.pending === slot) node.pending = undefined;
	if (--live === 0) setPendingWorld(false);
	if (shadow === undefined) return;
	graph.removeQueued(shadow);
	while (shadow.deps) graph.graph.unlink(shadow.deps, shadow);
	if (shadow.subs !== undefined) moveReaders(slot);
	for (const source of [
		shadow.nativeSource,
		shadow.nativeLatestSource,
		shadow.nativeSnapshotSource,
	])
		(source as PendingSource | undefined)?.settle(installed);
	graph.releaseRetention(shadow);
	// A thenable the shadow threw must not retain it, or its owner, once released.
	if (shadow.wakeup) shadow.wakeup.node = undefined;
	shadow.compute = undefined;
	const producer = slot.producer;
	slot.producer = undefined;
	// Producer aborts run user code; every graph edge is already gone.
	if (producer !== undefined) withCommittedSignals(() => producer.dispose());
}

function drop(slot: PendingSlotLike): void {
	release(slot as PendingSlot, false);
}

interface Install {
	readonly slot: PendingSlot;
	readonly state: NodeState;
	readonly receipt: CandidateProducerReceipt | undefined;
}

/** The pending state a slot can make committed, or undefined to drop it. */
function installable(slot: PendingSlot): Install | undefined {
	const { node, shadow } = slot;
	if (shadow === undefined || node.owner.retired) return undefined;
	const state = shadow.state;
	if (state === undefined) return undefined;
	if (node.kind === 'signal') return { slot, state, receipt: undefined };
	// A computation installs only a complete result its batch read and that no
	// input has changed since. Anything else recomputes from committed state.
	if (
		shadow.flags & (REACTIVE_DIRTY | REACTIVE_PENDING) ||
		state.snapshot.status === 'pending' ||
		state.snapshot.status === 'idle'
	)
		return undefined;
	if (slot.producer === undefined) return { slot, state, receipt: undefined };
	const outcome = slot.producer.prepare();
	return outcome.status === 'ready' && outcome.receipt.validate()
		? { slot, state, receipt: outcome.receipt }
		: undefined;
}

function promote(slots: readonly PendingSlotLike[]): void {
	graph.signalBatch(() => {
		withCommittedSignals(() => promoteSlots(slots as PendingSlot[]));
		// DOM bindings present the batch before any public subscriber hears of it,
		// once the batch ends outside committed scope.
		graph.presentQueued();
	});
}

function promoteSlots(slots: readonly PendingSlot[]): void {
	let installs: Install[] = [];
	const dropped: PendingSlot[] = [];
	for (const slot of slots) {
		if (slot.dead) continue;
		const install = installable(slot);
		if (install === undefined) dropped.push(slot);
		else installs.push(install);
	}
	// An installed computation must have read only committed or installed nodes.
	for (let stable = false; !stable;) {
		stable = true;
		const shadows = new Set(installs.map((install) => install.slot.shadow));
		installs = installs.filter((install) => {
			for (let link = install.slot.shadow!.deps; link !== undefined; link = link.nextDep) {
				const dependency = link.dep as ScopedNode;
				if (isShadow(dependency) && !shadows.has(dependency)) {
					dropped.push(install.slot);
					stable = false;
					return false;
				}
			}
			return true;
		});
	}
	for (const { slot } of installs) slot.promoting = true;
	// Readers of a dropped shadow read the committed node from now on, and
	// presented something it may not: they hear of it.
	for (const slot of dropped) {
		const read = slot.shadow?.subs !== undefined;
		release(slot, false);
		if (read && !slot.node.owner.retired) graph.invalidateNode(slot.node);
	}
	// Guard installed nodes from propagation through their old and new edges.
	// Alien still owns frontier traversal; every changed node propagates once.
	for (const { slot } of installs) slot.node.flags |= REACTIVE_DIRTY;
	const changed: ScopedNode[] = [];
	const releases: (() => void)[] = [];
	for (const { slot, state, receipt } of installs) {
		const { node, shadow } = slot as { node: ScopedNode; shadow: ScopedNode };
		if (receipt !== undefined) releases.push(receipt.publish());
		if (node.kind !== 'signal') {
			while (node.deps) graph.graph.unlink(node.deps, node);
			for (let link = shadow.deps; link !== undefined; link = link.nextDep)
				graph.link(canonical(link.dep as ScopedNode), node);
		}
		const { last, lastState, hasLast } = shadow;
		const currentChanged =
			node.state?.snapshot !== state.snapshot || !graph.sameState(node.state, state);
		const retainedChanged =
			node.hasLast !== hasLast ||
			!Object.is(node.last, last) ||
			(lastState ? !graph.sameState(node.lastState, lastState) : node.lastState !== undefined);
		if (currentChanged) graph.commitState(node, state);
		if (node.lastState?.owners !== lastState?.owners) graph.releaseRetainedOwners(node);
		node.last = last;
		node.lastState = lastState;
		node.hasLast = hasLast;
		if (state.snapshot.status !== 'ready') graph.retainOwners(node);
		// An unchanged error/idle snapshot can still expose a new latest
		// value. Native witnesses and latest-derived consumers must advance.
		if (!currentChanged && retainedChanged) node.revision++;
		if (currentChanged || retainedChanged) changed.push(node);
	}
	const deferred = candidateHooks.defer;
	candidateHooks.defer = true;
	try {
		for (const node of changed) {
			if (node.subs) {
				graph.graph.propagate(node.subs, false);
				graph.graph.shallowPropagate(node.subs);
			}
		}
	} finally {
		candidateHooks.defer = deferred;
	}
	for (const { slot } of installs) slot.node.flags = REACTIVE_MUTABLE | REACTIVE_WATCHING;
	try {
		for (const { receipt } of installs) receipt?.accept?.();
	} finally {
		// The shadow's readers move to the committed node without hearing of the
		// change they already presented.
		for (const { slot } of installs) release(slot, true);
		for (const release of releases) release();
	}
}

const pending: PendingSignals = {
	host: undefined,
	batch: () => (committedSignals !== 0 ? null : pending.host!.batch()),
	write,
	rebase,
	resolve,
	enter,
	leave,
	hides,
	source: (shadow) => new PendingSource(shadow.pending as PendingSlot, shadow),
	drop,
	promote,
};

export function createPendingSignals(): PendingSignals {
	return pending;
}
