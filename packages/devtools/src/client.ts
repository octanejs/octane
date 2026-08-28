import { EventClient } from '@tanstack/devtools-event-client';

export const PLUGIN_ID = 'octane';

// --- Wire types (the serialized contract; decoupled from runtime in-memory types) ---
export interface WireTreeNode {
	id: number;
	name: string;
	kind: string;
	children: WireTreeNode[];
}
export interface TreeSnapshot {
	nodes: WireTreeNode[];
}
export interface WireHookCell {
	kind: string;
	value: unknown;
}
export interface NodeDetail {
	id: number;
	name: string;
	hooks: WireHookCell[];
	context: Array<{ name: string; value: unknown }>;
	effectCount: number;
	/** Optional capability: older runtimes and scopes without native reads omit it. */
	nativeReads?: NativeReadOwnerWire;
}

export interface NativeReadSourceWire {
	scopeKey: string;
	key: string;
	read: 'value' | 'latest' | 'snapshot';
	kind: 'signal' | 'derived' | 'async';
	status: 'ready' | 'pending' | 'error' | 'unevaluated';
	revision: number;
	generation?: number;
	epoch: number;
	retired: boolean;
	historical: boolean;
	retained: boolean;
	refreshing: boolean;
	connection: 'none' | 'connecting' | 'open' | 'closed';
	complete: boolean;
	dependencies: readonly { scopeKey: string; key: string }[];
}

export interface NativeReadWire {
	observedVersion: number | null;
	currentVersion: number;
	source: NativeReadSourceWire | null;
}

export interface NativeReadAttemptWire {
	mixed: boolean;
	reads: readonly NativeReadWire[];
}

export interface NativeReadOwnerWire {
	ownerId: number;
	committed: NativeReadAttemptWire | null;
	pending: readonly NativeReadAttemptWire[];
	retry: readonly NativeReadWire[];
}
export interface InspectRequest {
	id: number;
}
export interface ProfileSummaryWire {
	componentId: string;
	component: string;
	file: string;
	attempts: number;
	completed: number;
	suspended: number;
	errored: number;
	bails: number;
	totalSelfTime: number;
	maxInclusiveTime: number;
	averageSelfTime: number;
	averageQueueDelay: number;
	dominantCause: string | null;
}
export interface ProfileEventWire {
	component: string;
	phase: 'mount' | 'update';
	outcome: 'completed' | 'suspended' | 'errored' | 'bailout';
	selfDuration: number;
	duration: number;
	queueDelay: number;
	causes: string[]; // cause.type values, flattened for display
}
export interface ProfileSnapshot {
	summaries: ProfileSummaryWire[];
	recentEvents: ProfileEventWire[];
}
export interface BoundaryWire {
	id: number;
	branch: number;
	state: 'init' | 'catch' | 'resolved' | 'pending';
	hasResolved: boolean;
	label: string;
}
export interface TransitionSnapshot {
	pendingCount: number;
	boundaries: BoundaryWire[];
}

type OctaneDevtoolsEventMap = {
	tree: TreeSnapshot;
	inspect: NodeDetail;
	'inspect-request': InspectRequest;
	'inspect-clear': InspectRequest;
	profile: ProfileSnapshot;
	transition: TransitionSnapshot;
	// Panel → bridge: "send me a fresh snapshot now" (emitted when the panel
	// mounts, so tabs populate regardless of subscribe-vs-first-flush timing).
	refresh: Record<string, never>;
};

export class OctaneDevtoolsEventClient extends EventClient<OctaneDevtoolsEventMap> {
	constructor() {
		super({ pluginId: PLUGIN_ID });
	}
}
