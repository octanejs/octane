/**
 * Snapshot assembly: fold the live bridge (`globalThis.__OCTANE_DEVTOOLS__`)
 * into one inert JSON document — the shared currency of the panel's export
 * button, the agent prompt builder, and the dev-server `/__octane_devtools/
 * snapshot` endpoint consumed by @octanejs/mcp-server.
 */

import type {
	DevtoolsDebugValue,
	DevtoolsEvent,
	DevtoolsHookInfo,
	DevtoolsSourceLocation,
	DevtoolsTreeNode,
	OctaneDevtools,
} from 'octane/devtools';
import type { ProfileSummary } from 'octane/profiling';
import { serializeValue, type SerializedValue, type SerializeOptions } from './serialize.js';

export interface SnapshotHook {
	order: number;
	kind: string;
	name: string;
	source: DevtoolsSourceLocation | null;
	value: SerializedValue;
	deps?: SerializedValue;
	hasCleanup?: boolean;
}

export interface SnapshotNode {
	id: number;
	type: DevtoolsTreeNode['type'];
	label: string;
	lite: boolean;
	key: string | null;
	source: DevtoolsSourceLocation | null;
	hookCount: number;
	pending: boolean;
	inactive: boolean;
	/** Serialized live props — present when state capture was enabled and available. */
	props?: SerializedValue;
	/** Serialized live hook cells, in first-render call order. */
	hooks?: SnapshotHook[];
	/** Serialized `useDebugValue` records (formatted at capture time). */
	debugValues?: SnapshotDebugValue[];
	domNodeCount?: number;
	children: SnapshotNode[];
}

export interface SnapshotDebugValue {
	order: number;
	owner: string | null;
	source: DevtoolsSourceLocation | null;
	value: SerializedValue;
}

/** The profiler's own aggregation row — one owner for the shape (octane/profiling). */
export type SnapshotPerformanceRow = ProfileSummary;

export interface DevtoolsSnapshot {
	source: 'octane-devtools';
	capturedAt: string;
	url: string | null;
	tree: SnapshotNode[];
	componentCount: number;
	/** Profiler aggregation (self-time-descending), when the profiler is live. */
	performance: SnapshotPerformanceRow[] | null;
	/** Recent bridge events (commits, effects, HMR, roots). */
	events: DevtoolsEvent[];
	notes: string[];
}

export interface SnapshotOptions {
	/**
	 * Capture serialized props/hook state per node. Bounded by
	 * `maxDetailedNodes` so a huge tree cannot produce an unbounded document.
	 */
	includeState?: boolean;
	maxDetailedNodes?: number;
	eventLimit?: number;
	serialize?: SerializeOptions;
	/**
	 * Drop performance rows whose file starts with any of these prefixes —
	 * the panel passes its own package prefix so its components never appear
	 * as the app's hot spots in prompts or MCP snapshots.
	 */
	excludeFilePrefixes?: string[];
}

/** The live bridge, when an instrumented Octane runtime installed it. */
export function getDevtoolsHook(): OctaneDevtools | null {
	try {
		const hook = globalThis.__OCTANE_DEVTOOLS__;
		return hook !== undefined && hook.isAttached() ? hook : null;
	} catch {
		return null;
	}
}

/** Resolve the bridge, waiting for an instrumented runtime to connect. */
export function waitForDevtoolsHook(timeoutMs = 5000): Promise<OctaneDevtools> {
	return new Promise((resolve, reject) => {
		const immediate = getDevtoolsHook();
		if (immediate !== null) {
			resolve(immediate);
			return;
		}
		const startedAt = Date.now();
		const timer = setInterval(() => {
			const hook = getDevtoolsHook();
			if (hook !== null) {
				clearInterval(timer);
				resolve(hook);
			} else if (Date.now() - startedAt > timeoutMs) {
				clearInterval(timer);
				reject(
					new Error(
						'Octane devtools bridge not found. Enable it with octane({ devtools: true }) in vite.config and run the dev server.',
					),
				);
			}
		}, 50);
	});
}

function serializeHooks(hooks: DevtoolsHookInfo[], options: SerializeOptions): SnapshotHook[] {
	return hooks.map((hook) => ({
		order: hook.order,
		kind: hook.kind,
		name: hook.name,
		source: hook.source,
		value: serializeValue(hook.value, options),
		...('deps' in hook && hook.deps !== undefined
			? { deps: serializeValue(hook.deps, options) }
			: null),
		...(hook.hasCleanup !== undefined ? { hasCleanup: hook.hasCleanup } : null),
	}));
}

/** Build one inert snapshot document from the live bridge. */
export function buildSnapshot(hook: OctaneDevtools, options?: SnapshotOptions): DevtoolsSnapshot {
	const includeState = options?.includeState !== false;
	const maxDetailedNodes = options?.maxDetailedNodes ?? 200;
	const eventLimit = options?.eventLimit ?? 100;
	const serializeOptions = options?.serialize ?? {};
	const excludeFilePrefixes = options?.excludeFilePrefixes ?? [];
	const notes: string[] = [];
	let componentCount = 0;
	let detailed = 0;
	let skippedDetail = 0;

	// Detail is captured BEFORE recursing so the budget is spent top-down: on
	// a tree larger than the budget, the root and top-level components — the
	// ones a reader orients by — carry state, and the leaves go structural.
	const convert = (node: DevtoolsTreeNode): SnapshotNode => {
		componentCount++;
		const out: SnapshotNode = {
			id: node.id,
			type: node.type,
			label: node.label,
			lite: node.lite,
			key: node.key,
			source: node.source,
			hookCount: node.hookCount,
			pending: node.pending,
			inactive: node.inactive,
			children: [],
		};
		const wantsDetail = includeState && (node.type === 'component' || node.type === 'root');
		if (wantsDetail) {
			if (detailed >= maxDetailedNodes) {
				skippedDetail++;
			} else {
				const detail = hook.inspect(node.id);
				if (detail !== null) {
					detailed++;
					if (detail.props !== undefined)
						out.props = serializeValue(detail.props, serializeOptions);
					out.hooks = serializeHooks(detail.hooks, serializeOptions);
					if (detail.debugValues.length > 0) {
						out.debugValues = detail.debugValues.map((debug: DevtoolsDebugValue) => ({
							order: debug.order,
							owner: debug.owner,
							source: debug.source,
							value: serializeValue(debug.value, serializeOptions),
						}));
					}
					out.domNodeCount = detail.domNodeCount;
				}
			}
		}
		out.children = node.children.map(convert);
		return out;
	};

	const tree = hook.getTree().map(convert);
	if (skippedDetail > 0) {
		notes.push(
			`State capture covered the first ${detailed} component nodes (top-down); ${skippedDetail} deeper nodes are structural only. The tree itself is complete.`,
		);
	}

	let performance: SnapshotPerformanceRow[] | null = null;
	const profiler = hook.getProfiler();
	if (profiler !== undefined) {
		try {
			performance = profiler
				.summary()
				.filter((row) => !excludeFilePrefixes.some((prefix) => row.file.startsWith(prefix)))
				.map((row) => ({ ...row }));
		} catch {
			notes.push('The profiler summary could not be read.');
		}
	}

	const events = hook.getEvents();
	return {
		source: 'octane-devtools',
		capturedAt: new Date().toISOString(),
		url:
			typeof location === 'object' && location !== null && typeof location.href === 'string'
				? location.href
				: null,
		tree,
		componentCount,
		performance,
		events: events.length > eventLimit ? events.slice(events.length - eventLimit) : events,
		notes,
	};
}
