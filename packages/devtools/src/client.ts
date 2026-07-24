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

type OctaneDevtoolsEventMap = {
	tree: TreeSnapshot;
	inspect: NodeDetail;
	'inspect-request': InspectRequest;
};

export class OctaneDevtoolsEventClient extends EventClient<OctaneDevtoolsEventMap> {
	constructor() {
		super({ pluginId: PLUGIN_ID });
	}
}
