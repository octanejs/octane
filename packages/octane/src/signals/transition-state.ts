import type { createReactiveSystem } from 'alien-signals/system';
import type { GraphOwner, ScopedNode, NodeState, SignalReadMode } from './graph.js';
import type { SignalCandidateFrame } from './transition-candidate.js';
import { setNativeCandidateResolver, type NativeReadSource } from './read-protocol.js';

/** Shared state must not import the candidate implementation: eager signal chunks
 * can otherwise absorb the full class used only by a later renderer chunk. */
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
}

/** The graph registers primitives, never a candidate factory. */
export let candidateGraph: CandidateGraph;
export function registerCandidateGraph(graph: CandidateGraph): void {
	candidateGraph = graph;
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

export let activeCandidate: SignalCandidateFrame | undefined;
/** Synchronous action scope; never keep a candidate active across an await. */
export function swapActiveSignalCandidate(
	frame: SignalCandidateFrame | undefined,
): SignalCandidateFrame | undefined {
	const previous = activeCandidate;
	activeCandidate = frame;
	return previous;
}

export let deferCandidateInvalidation = false;
export function swapCandidateInvalidation(defer: boolean): boolean {
	const previous = deferCandidateInvalidation;
	deferCandidateInvalidation = defer;
	return previous;
}

export let candidateWriteCount = 0;
export let candidateWriters: WeakMap<ScopedNode, Set<SignalCandidateFrame>> | undefined;

export function addCandidateWriter(node: ScopedNode, frame: SignalCandidateFrame): void {
	candidateWriteCount++;
	candidateWriters ??= new WeakMap();
	let writers = candidateWriters.get(node);
	if (!writers) candidateWriters.set(node, (writers = new Set()));
	writers.add(frame);
}

export function removeCandidateWriter(node: ScopedNode, frame: SignalCandidateFrame): void {
	const writers = candidateWriters!.get(node)!;
	writers.delete(frame);
	if (writers.size === 0) candidateWriters!.delete(node);
	if (--candidateWriteCount === 0) candidateWriters = undefined;
}

export function recordCandidateUrgentWrite(
	node: ScopedNode,
	value: unknown,
): (() => void)[] | undefined {
	let releases: (() => void)[] | undefined;
	const writers = candidateWriters?.get(node);
	if (writers)
		for (const frame of writers) {
			const release = frame.recordUrgentWrite(node, value);
			if (release) (releases ??= []).push(release);
		}
	return releases;
}
