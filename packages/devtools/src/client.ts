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

type OctaneDevtoolsEventMap = {
	tree: TreeSnapshot;
	inspect: NodeDetail;
	'inspect-request': InspectRequest;
	profile: ProfileSnapshot;
};

export class OctaneDevtoolsEventClient extends EventClient<OctaneDevtoolsEventMap> {
	constructor() {
		super({ pluginId: PLUGIN_ID });
	}
}
