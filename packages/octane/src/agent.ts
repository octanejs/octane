// `octane/agent`: the page side of the agent driver in `@octanejs/mcp-server`
// (#2508). The driver injects this module ahead of the app's own scripts in a
// development page it opens, so the test clock owns the runtime's time from
// boot: between two driver operations nothing moves. A person opening the
// same page never loads it. Apps do not import it.
import { installTestClock } from './testing.js';

interface DevtoolsNode {
	id: number;
	name: string;
	kind: string;
	children: DevtoolsNode[];
}
interface DevtoolsHook {
	getTree(): DevtoolsNode[];
	inspect(id: number): { hooks: Array<{ kind: string; value: unknown }> } | null;
}

/** A component and the values of its state hooks, as `state` reports them. */
export interface AgentStateNode {
	name: string;
	state: unknown[];
	children: AgentStateNode[];
}

export interface OctaneAgent {
	readonly version: 1;
	/** The clock's time in milliseconds. */
	now(): number;
	/** Run the work that is due now, as an input's own task would, without moving time. */
	due(): Promise<number>;
	advance(ms: number): Promise<number>;
	frame(): Promise<number>;
	settle(): Promise<number>;
	/**
	 * Mounted components with their `useState`/`useReducer` values, or `null`
	 * when the page was built without the runtime devtools hook.
	 */
	state(): AgentStateNode[] | null;
}

// The runtime records a component under the kind of block that holds it: a
// root, a dynamic position, or its own scope. Blocks for control flow (`@if`,
// `@for`) and portals, and anything the hook cannot name, are not components:
// their children are lifted to the nearest component.
const COMPONENT_KINDS = new Set(['component', 'root', 'dynamic']);
function collect(hook: DevtoolsHook, nodes: DevtoolsNode[]): AgentStateNode[] {
	const out: AgentStateNode[] = [];
	for (const node of nodes) {
		const children = collect(hook, node.children);
		if (!COMPONENT_KINDS.has(node.kind) || node.name === 'Unknown') {
			out.push(...children);
			continue;
		}
		const detail = hook.inspect(node.id);
		const state = (detail?.hooks ?? [])
			.filter((cell) => cell.kind === 'state' || cell.kind === 'reducer')
			.map((cell) => cell.value);
		out.push({ name: node.name, state, children });
	}
	return out;
}

const clock = installTestClock();
const agent: OctaneAgent = {
	version: 1,
	now: () => clock.now(),
	due: () => clock.advance(0).then(clock.now),
	advance: (ms) => clock.advance(ms).then(clock.now),
	frame: () => clock.frame().then(clock.now),
	settle: () => clock.settle().then(clock.now),
	state() {
		const hook = (globalThis as { __OCTANE_DEVTOOLS__?: DevtoolsHook }).__OCTANE_DEVTOOLS__;
		return hook ? collect(hook, hook.getTree()) : null;
	},
};
(globalThis as { __OCTANE_AGENT__?: OctaneAgent }).__OCTANE_AGENT__ = agent;
