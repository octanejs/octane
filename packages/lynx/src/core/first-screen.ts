import type { UniversalEventPriority, UniversalSerializableValue } from 'octane/universal/native';
import type { LynxElementRef } from './papi.js';

/** Clone-safe event identity retained while ordinary events wait for adoption. */
export interface LynxFirstTreeEventSnapshot {
	readonly host: number;
	readonly generation: number;
	readonly type: string;
	readonly listener: number;
	readonly priority: UniversalEventPriority;
}

/** Clone-safe description of one physical node painted by the main runtime. */
export interface LynxFirstTreeNodeSnapshot {
	readonly id: number;
	readonly nativeId: number;
	readonly type: string;
	readonly generation: number;
	readonly parent: number | null;
	readonly children: readonly number[];
	readonly props: Readonly<Record<string, UniversalSerializableValue>>;
	readonly visible: boolean;
	readonly events: readonly LynxFirstTreeEventSnapshot[];
}

/**
 * Serializable first-paint contract. PAPI node references deliberately remain
 * in the opaque journal carried by {@link LynxFirstTree}.
 */
export interface LynxFirstTreeSnapshot {
	readonly format: 1;
	readonly renderer: 'lynx';
	readonly root: number;
	readonly version: number;
	readonly plan: string | null;
	readonly roots: readonly number[];
	readonly nodes: readonly LynxFirstTreeNodeSnapshot[];
}

export interface CaptureLynxFirstTreeOptions {
	/** Deterministic compiler plan identity used only to enrich mismatch reports. */
	readonly plan?: string;
}

export interface LynxResolvedFirstTreeEvent {
	readonly host: number;
	readonly generation: number;
	readonly type: string;
	readonly listener: number;
	readonly priority: UniversalEventPriority;
}

export const LYNX_FIRST_TREE_MISMATCH = 'OCTANE_LYNX_FIRST_SCREEN_MISMATCH' as const;

/** Stable mismatch category; the host repairs from the background tree. */
export class LynxFirstTreeMismatchError extends Error {
	readonly code = LYNX_FIRST_TREE_MISMATCH;
	readonly path: string;
	readonly plan: string | null;

	constructor(path: string, message: string, plan: string | null = null) {
		super(`Octane Lynx first-screen mismatch at ${path}: ${message}`);
		this.name = 'LynxFirstTreeMismatchError';
		this.path = path;
		this.plan = plan;
	}
}

export const LYNX_FIRST_TREE_STATE: unique symbol = Symbol('octane.lynx.first-tree-state');

export interface LynxFirstTreeState<Node extends LynxElementRef> {
	owner: unknown;
	status: 'available' | 'transferred' | 'disposed' | 'released';
	readonly eventsByToken: Map<string, LynxResolvedFirstTreeEvent>;
}

/** Opaque main-local ownership journal paired with its clone-safe snapshot. */
export interface LynxFirstTree<Node extends LynxElementRef = LynxElementRef> {
	readonly snapshot: LynxFirstTreeSnapshot;
	readonly [LYNX_FIRST_TREE_STATE]: LynxFirstTreeState<Node>;
}

export function createLynxFirstTree<Node extends LynxElementRef>(
	snapshot: LynxFirstTreeSnapshot,
	owner: unknown,
	eventsByToken: Map<string, LynxResolvedFirstTreeEvent>,
): LynxFirstTree<Node> {
	const state: LynxFirstTreeState<Node> = {
		owner,
		status: 'available',
		eventsByToken,
	};
	return Object.freeze({ snapshot, [LYNX_FIRST_TREE_STATE]: state });
}

/** Release clone-unsafe journal state after adoption replay has drained. */
export function releaseLynxFirstTree(firstTree: LynxFirstTree): void {
	const state = firstTree[LYNX_FIRST_TREE_STATE];
	if (state.status === 'released') return;
	if (state.status === 'available') {
		throw new Error('Octane Lynx first tree must be adopted or disposed before release.');
	}
	state.owner = null;
	state.eventsByToken.clear();
	state.status = 'released';
}

/** Resolve a painted placeholder token without consulting adopted listeners. */
export function resolveLynxFirstTreeEvent(
	firstTree: LynxFirstTree,
	token: unknown,
): LynxResolvedFirstTreeEvent | null {
	if (typeof token !== 'string') return null;
	return firstTree[LYNX_FIRST_TREE_STATE].eventsByToken.get(token) ?? null;
}
