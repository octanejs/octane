import type { DerivedBinding } from './computations.js';
import type {
	CandidateProducer,
	DeclarationViewFork,
	GraphOwner,
	NodeState,
	ScopedNode,
	SignalGraph,
	SignalObserver,
	SignalReadMode,
} from './graph.js';
import type { NativeReadSource } from './read-protocol.js';
import type { ResourceBinding } from './requests.js';

/**
 * The graph operations pending.ts and the server seed serializer need. The
 * graph registers them, so pending state can live with the renderer
 * (`octane-islands`, see action-capability.ts) and a server render that never
 * creates a signal never loads the graph, without either importing it.
 */
interface GraphBridge {
	ScopedNode: typeof import('./graph.js').ScopedNode;
	graph: SignalGraph;
	historical(): boolean;
	assertAlive(owner: GraphOwner): void;
	link(from: ScopedNode, to: ScopedNode | SignalObserver): void;
	removeQueued(node: ScopedNode): void;
	strictValue<T>(state: NodeState<T>, key?: string): T;
	refreshNode<T>(node: ScopedNode<T>): NodeState<T>;
	pure<T>(read: () => T): T;
	untrack<T>(read: () => T): T;
	signalBatch<T>(read: () => T): T;
	presentQueued(): void;
	publishNode<T>(node: ScopedNode<T>, state: NodeState<T>): void;
	invalidateNode(node: ScopedNode): void;
	readyState<T>(value: T): NodeState<T>;
	commitState(node: ScopedNode, state: NodeState): void;
	sameState(a: NodeState | undefined, b: NodeState): boolean;
	releaseRetainedOwners(node: ScopedNode): void;
	retainOwners(node: ScopedNode): void;
	releaseRetention(node: ScopedNode): void;
	attachObserver(node: ScopedNode, notify: () => void, native: boolean): () => void;
	declarationViewFork(node: ScopedNode): DeclarationViewFork | undefined;
	isDeclarationView(node: unknown): boolean;
}

export let graphBridge: GraphBridge;
export function registerGraphBridge(graph: GraphBridge): void {
	graphBridge = graph;
}

/**
 * What the renderer's transitions tell pending signals (runtime.ts installs it
 * with startTransition). Batches are the renderer's own records; the graph only
 * passes them back.
 */
export interface PendingHost {
	/** The transition batch a write joins, or null for an urgent write. */
	batch(): object | null;
	/**
	 * Whether the current read sees `batch`: a transition render that folds it,
	 * or its synchronous transition callback. Undefined outside both, as at commit.
	 */
	visible(batch: object): boolean | undefined;
	root(batch: object): object;
	/** Commit two batches together, as transitions that update one hook cell are. */
	entangle(into: object, from: object): void;
	/** A Block that reads a node pending in `batch` renders with it. */
	consume(batch: object, block: object): void;
	/** Promote `slot` when `batch` finishes. */
	hold(batch: object, slot: PendingSlotLike): void;
}

/** A node's pending state (pending.ts), opaque to the graph and the renderer. */
export interface PendingSlotLike {
	readonly node: ScopedNode;
	readonly shadow: ScopedNode | undefined;
	batch: object;
}

/** A forked binding runs and resolves its reads in its slot's batch. */
export interface CandidateContext {
	run<T>(callback: () => T): T;
	resolve<T>(node: ScopedNode<T>): ScopedNode<T>;
	canonical<T>(node: ScopedNode<T>): ScopedNode<T>;
}

/** The graph's entry points into pending.ts. */
export interface PendingSignals {
	host: PendingHost | undefined;
	/** The batch a write joins, or null when it is urgent. */
	batch(): object | null;
	write(node: ScopedNode, value: unknown, batch: object): void;
	/** An urgent write re-applies on top of the node's pending value. */
	rebase(node: ScopedNode, value: unknown): void;
	resolve<T>(node: ScopedNode<T>): ScopedNode<T>;
	/** Entered around every evaluation while any slot is live; returns the outer world. */
	enter(node: ScopedNode): unknown;
	leave(world: unknown, node: ScopedNode): void;
	/** A committed node whose pending state the current read sees instead. */
	hides(node: ScopedNode): boolean;
	source(shadow: ScopedNode, read: SignalReadMode): NativeReadSource;
	drop(slot: PendingSlotLike): void;
	promote(slots: readonly PendingSlotLike[]): void;
}

/** Installed once both the renderer's transitions and the pending code are present. */
export let pendingSignals: PendingSignals | undefined;
/** pendingSignals while any node is pending: reads consult it only then. */
export let pendingWorld: PendingSignals | undefined;
let implementation: PendingSignals | undefined;
let host: PendingHost | undefined;

// Signals can load before or after the renderer's first transition.
function activate(): void {
	if (implementation === undefined || host === undefined) return;
	implementation.host = host;
	pendingSignals = implementation;
}

export function registerPendingSignals(value: PendingSignals): void {
	implementation ??= value;
	activate();
}

export function registerPendingHost(value: PendingHost): void {
	host = value;
	activate();
}

export function setPendingWorld(live: boolean): void {
	pendingWorld = live ? pendingSignals : undefined;
}

/** Writes and reads inside are urgent and committed, whatever transition is active. */
export let committedSignals = 0;
export function withCommittedSignals<T>(callback: () => T): T {
	committedSignals++;
	try {
		return callback();
	} finally {
		committedSignals--;
	}
}

/** Internal capability refusal, distinct from an authored TypeError. */
export class CandidateUnsupportedError extends TypeError {}

/**
 * What only pending state uses, consulted by the graph and the binding modules.
 * pending.ts and its candidate producers (candidate-producers.ts) install these,
 * so a bundle that carries neither carries none of their code. Every field is
 * declared up front: the graph reads this object on invalidation, and its shape
 * never changes.
 */
export const candidateHooks: {
	/** Promotion runs its graph's producer invalidation after the graph settles. */
	defer: boolean;
	/** Forks a resource (requests.ts) into a private candidate. */
	resource?: ((this: ResourceBinding, target: ScopedNode) => CandidateProducer) | undefined;
	/** Forks a general derived binding (computations.ts) into a private candidate. */
	derived?:
		| ((
				this: DerivedBinding<any>,
				target: ScopedNode,
				context: CandidateContext,
		  ) => CandidateProducer)
		| undefined;
} = { defer: false, resource: undefined, derived: undefined };
