import type { createReactiveSystem } from 'alien-signals/system';
import type { DerivedBinding } from './computations.js';
import type {
	CandidateProducer,
	DeclarationViewFork,
	GraphOwner,
	ScopedNode,
	NodeState,
	SignalReadMode,
} from './graph.js';
import type { ResourceBinding } from './requests.js';
import type { SignalActionFrame } from './transition-action.js';
import type { SignalCandidateFrame } from './transition-candidate.js';
import type { SignalTransitionCoordinatorFactory } from './transition-coordinator.js';
import { setNativeCandidateResolver, type NativeReadSource } from './read-protocol.js';

/** Shared state keeps model registration separate from optional native presentation. */
interface CandidateGraph {
	ScopedNode: typeof import('./graph.js').ScopedNode;
	graph: ReturnType<typeof createReactiveSystem>;
	flags: { Dirty: number; Mutable: number; Watching: number };
	historical(): boolean;
	link(from: ScopedNode, to: ScopedNode): void;
	removeQueued(node: ScopedNode): void;
	assertAlive(owner: GraphOwner): void;
	strictValue<T>(state: NodeState<T>, key?: string): T;
	refreshNode<T>(node: ScopedNode<T>): NodeState<T>;
	pure<T>(read: () => T): T;
	untrack<T>(read: () => T): T;
	signalBatch<T>(read: () => T): T;
	publishNode<T>(node: ScopedNode<T>, state: NodeState<T>): void;
	readyState<T>(value: T): NodeState<T>;
	commitState(node: ScopedNode, state: NodeState): void;
	sameState(a: NodeState | undefined, b: NodeState): boolean;
	releaseRetainedOwners(node: ScopedNode): void;
	retainOwners(node: ScopedNode): void;
	releaseRetention(node: ScopedNode): void;
	createNativeSource(node: ScopedNode, mode: SignalReadMode): NativeReadSource;
	attachObserver(node: ScopedNode, notify: () => void, native: boolean): () => void;
	declarationViewFork(node: ScopedNode): DeclarationViewFork | undefined;
}

/** Graph registration owns model transactions; native presentation remains optional. */
export let candidateGraph: CandidateGraph;
export function registerCandidateGraph(graph: CandidateGraph): void {
	candidateGraph = graph;
}

/**
 * The graph's default registration (action-capability.ts). It is live, so it
 * also admits signals loaded after a renderer Action has awaited.
 */
export let createSignalActionFrame: (() => SignalActionFrame) | undefined;
export function registerSignalActionFrameFactory(factory: () => SignalActionFrame): void {
	createSignalActionFrame = factory;
}

/** The renderer consults this live capability when its first native write occurs. */
export let createSignalTransitionCoordinator: SignalTransitionCoordinatorFactory | undefined;
export function registerSignalTransitionCoordinatorFactory(
	factory: SignalTransitionCoordinatorFactory,
): void {
	createSignalTransitionCoordinator = factory;
}

export function withoutSignalCandidate<T>(callback: () => T): T {
	const previous = activeCandidate;
	const resolver = setNativeCandidateResolver(null);
	activeCandidate = undefined;
	try {
		return callback();
	} finally {
		activeCandidate = previous;
		setNativeCandidateResolver(resolver);
	}
}

/** Internal capability refusal, distinct from an authored TypeError. */
export class CandidateUnsupportedError extends TypeError {}

export let activeCandidate: SignalActionFrame | undefined;
/** Synchronous action scope; never keep a candidate active across an await. */
export function swapActiveSignalCandidate(
	frame: SignalActionFrame | undefined,
): SignalActionFrame | undefined {
	const previous = activeCandidate;
	activeCandidate = frame;
	return previous;
}

/**
 * What only an Action frame uses, consulted by the graph and the binding modules.
 * The frame (transition-action.ts) and its candidate producers
 * (candidate-producers.ts) install these, so a bundle that carries no frame
 * carries none of their code. Every field is declared up front: the graph reads
 * this object on writes and invalidation, and its shape never changes.
 */
export const candidateHooks: {
	/** Accepting a frame runs its graph's producer invalidation after the graph settles. */
	defer: boolean;
	/** Present while a frame holds a write: revokes or records it for an urgent write. */
	urgentWrite?: (node: ScopedNode, value: unknown) => (() => void)[] | undefined;
	/** Forks a resource (requests.ts) into a private candidate. */
	resource?: (this: ResourceBinding, target: ScopedNode) => CandidateProducer;
	/** Forks a general derived binding (computations.ts) into a private candidate. */
	derived?: (
		this: DerivedBinding<any>,
		target: ScopedNode,
		frame: SignalCandidateFrame,
	) => CandidateProducer;
} = { defer: false, urgentWrite: undefined, resource: undefined, derived: undefined };
