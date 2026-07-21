/**
 * Build-specialized development inspector bridge for Octane.
 *
 * The bundler integration defines `__OCTANE_DEVTOOLS_ENABLED__` only for an
 * explicitly opted-in dev server (`octane({ devtools: true })`, serve mode
 * only), and runtime.ts calls every `__devtools*` helper behind that constant
 * — the `octane/profiling` pattern — so normal and production bundles
 * tree-shake this module and every instrumentation branch away.
 *
 * The bridge stores structure and identities, never copies of application
 * state: `inspect()` returns live same-realm references, and serialization
 * policy (depth limits, redaction) belongs to the consumer
 * (`@octanejs/devtools`, the panel UI / agent snapshot layer).
 */

import {
	__profileHookMetadataFor,
	__profileMetadataFor,
	__profileNow as now,
	__profileOnCommit,
	__profileSubjectFor,
	__profileSubjectId,
	__profileTrackedComponentFor,
	type HookProfileMetadata,
	type OctaneProfiler,
} from './profiling.js';

export interface DevtoolsSourceLocation {
	file: string;
	line: number;
	column: number;
}

export type DevtoolsNodeType = 'root' | 'component' | 'control-flow' | 'list-item' | 'portal';

/**
 * One node of the live component tree. Serializable (no live references), so
 * it can cross a postMessage/HTTP boundary unchanged; live values are read
 * separately through `inspect(id)`.
 */
export interface DevtoolsTreeNode {
	/**
	 * Stable per live instance for the instance's lifetime, and shared with the
	 * profiler: equal to `ProfileEvent.instanceId` for the same instance, so a
	 * profiler event row resolves through `inspect()`/`getDomNodes()` directly.
	 */
	id: number;
	type: DevtoolsNodeType;
	label: string;
	/** True for an inlined (hookable but non-scheduling) lite component. */
	lite: boolean;
	/** Keyed `@for` item key, as a display string. */
	key: string | null;
	source: DevtoolsSourceLocation | null;
	hookCount: number;
	/** A re-render is queued but has not run yet. */
	pending: boolean;
	/** Inside a hidden `<Activity>` subtree. */
	inactive: boolean;
	children: DevtoolsTreeNode[];
}

export interface DevtoolsHookInfo {
	/** First-render call order within the owning component. */
	order: number;
	/** Display form of the compiler slot key (symbol description or index). */
	slot: string;
	/** `useState`, `useEffect`, … from compiler metadata, else a shape-derived guess. */
	kind: string;
	name: string;
	source: DevtoolsSourceLocation | null;
	/** Live current value (state/memo/ref/callback); the raw cell for exotic hooks. */
	value: unknown;
	/** Effect/memo dependency values, when the cell carries them. */
	deps?: unknown;
	/** Effect slots only: a cleanup is currently registered. */
	hasCleanup?: boolean;
}

/** One recorded `useDebugValue(value, format?)` call, formatted at inspect time. */
export interface DevtoolsDebugValue {
	order: number;
	/** The custom hook that owns the call, when compiler metadata names it. */
	owner: string | null;
	source: DevtoolsSourceLocation | null;
	/** Live formatted value (the React contract: `format` runs only when inspected). */
	value: unknown;
}

export interface DevtoolsInstanceDetail {
	id: number;
	type: DevtoolsNodeType;
	label: string;
	source: DevtoolsSourceLocation | null;
	/** Live props object (undefined for lite components — their props are not retained). */
	props: unknown;
	hooks: DevtoolsHookInfo[];
	debugValues: DevtoolsDebugValue[];
	domNodeCount: number;
}

export type DevtoolsEffectPhase = 'insertion' | 'layout' | 'passive';

export type DevtoolsEvent =
	| {
			kind: 'commit';
			at: number;
			/** Tree-node ids of the roots this commit rendered, when attributable. */
			roots?: number[];
	  }
	| {
			kind: 'effect';
			at: number;
			phase: DevtoolsEffectPhase;
			duration: number;
			component: string | null;
			componentSource: DevtoolsSourceLocation | null;
			hook: string | null;
			hookSource: DevtoolsSourceLocation | null;
	  }
	| { kind: 'hmr'; at: number; component: string | null }
	| { kind: 'root-added'; at: number }
	| { kind: 'root-removed'; at: number };

/** Runtime ABI: reflection callbacks implemented inside runtime.ts (which owns the internals). */
export interface DevtoolsRuntimeAdapter {
	buildRootNode(root: object, idFor: (subject: object) => number): DevtoolsTreeNode;
	inspect(subject: object, id: number): DevtoolsInstanceDetail | null;
	domNodes(subject: object): Node[];
	/** The deepest tree subject under `root` whose managed DOM contains `target`. */
	findByDomNode(root: object, target: Node): object | null;
}

export interface OctaneDevtools {
	readonly version: 1;
	/** True once an instrumented Octane runtime has connected. */
	isAttached(): boolean;
	subscribe(listener: (event: DevtoolsEvent) => void): () => void;
	/** One tree per live (non-internal) root, in registration order. */
	getTree(): DevtoolsTreeNode[];
	/** Live-value detail for a tree node id. Null when the instance is gone. */
	inspect(id: number): DevtoolsInstanceDetail | null;
	/** The DOM nodes a tree node currently manages (live references, same realm). */
	getDomNodes(id: number): Node[];
	/**
	 * Reverse lookup for element pickers: the id of the deepest tree node whose
	 * managed DOM contains `target`, or null when no live root owns it.
	 */
	findByDomNode(target: Node): number | null;
	/**
	 * Compiler-registered source metadata for a component function. The panel
	 * uses its own components' entries to derive a layout-independent path
	 * prefix for self-exclusion; null for unregistered functions.
	 */
	getComponentSource(component: Function): DevtoolsSourceLocation | null;
	getEvents(): DevtoolsEvent[];
	clearEvents(): void;
	setRecording(recording: boolean): void;
	isRecording(): boolean;
	/**
	 * Per-effect timing is the only per-render-cycle instrumentation with a
	 * measurable cost, so it is OFF until the panel's timeline explicitly
	 * enables it — a devtools build otherwise adds only one event per commit.
	 */
	setEffectTelemetry(enabled: boolean): void;
	isEffectTelemetryEnabled(): boolean;
	/**
	 * Exclude a container element's future roots from the tree — the panel
	 * marks its own host before calling createRoot so it never inspects itself.
	 */
	markContainerInternal(container: object): void;
	/** The co-installed profiler API, when profile recording is active. */
	getProfiler(): OctaneProfiler | undefined;
}

declare global {
	// Installed lazily by the instrumented runtime, so an uninstrumented build
	// never mutates the global object.
	var __OCTANE_DEVTOOLS__: OctaneDevtools | undefined;
}

const DEFAULT_EVENT_BUFFER = 2000;

let adapter: DevtoolsRuntimeAdapter | null = null;
let recording = true;
let effectTelemetry = false;
let events: DevtoolsEvent[] = [];
let eventHead = 0;
let eventCount = 0;
const listeners = new Set<(event: DevtoolsEvent) => void>();
const internalContainers = new WeakSet<object>();

/** Live root subjects in registration order (insertion-ordered Set). */
const liveRoots = new Set<object>();

/**
 * Roots whose registration was skipped because their container is internal
 * (the panel's own root). Commits attributable ONLY to these roots are
 * dropped entirely, so the panel never reacts to its own renders.
 */
const internalRoots = new WeakSet<object>();

/** True when an event would have an observer — producers skip allocation otherwise. */
function hasEventConsumer(): boolean {
	return recording || listeners.size > 0;
}

/**
 * Instance identity comes from the shared profiling registry, so a tree-node
 * id, `inspect(id)`, `getDomNodes(id)`, and the profiler's
 * `ProfileEvent.instanceId` all name the same live instance — a profiler event
 * row resolves straight back through this bridge. Reverse entries are weakly
 * held and GC-reclaimed by that registry, so the bridge pins nothing and needs
 * no periodic pruning.
 */
const idFor = __profileSubjectId;
const subjectFor = __profileSubjectFor;

/**
 * Per-root memo of the last built tree, so `getTree()` re-walks only roots
 * that actually changed — the difference between O(changed subtree) and
 * O(whole app) per panel refresh on large trees. A cached tree stays valid
 * until work is scheduled anywhere under its root: every render entry point
 * reports its root through `__devtoolsRootTouched` BEFORE the work flushes
 * (so even the transient `pending` bit is never served stale). Keyed weakly —
 * a dead root drops its cached tree with it. Consumers must treat returned
 * nodes as immutable (they already must: nodes are shared with the event
 * stream's serialization path).
 */
const rootTreeCache = new WeakMap<object, DevtoolsTreeNode>();

/** Runtime ABI: work was scheduled under `root`; its cached tree is stale. */
export function __devtoolsRootTouched(root: object): void {
	rootTreeCache.delete(root);
}

/**
 * `useDebugValue` records, keyed per render scope then per compiler slot —
 * slot identity makes re-renders overwrite in place, and Map insertion order
 * preserves the first-render call order. A WeakMap sidecar (never a Scope
 * field) so instrumentation cannot perturb the runtime's object shapes.
 */
interface DebugValueCell {
	value: unknown;
	format: ((value: unknown) => unknown) | undefined;
}
const debugValueCells = new WeakMap<object, Map<symbol | number, DebugValueCell>>();
/** Flips on the first useDebugValue ever; until then every render skips the sidecar lookup. */
let hasDebugValues = false;

/**
 * Picker memo: pointermove fires many times per hovered element, so the last
 * reverse lookup is cached per target and dropped whenever a commit or root
 * change could move DOM between components. Dropping the entry (rather than
 * versioning it) also releases the target reference, so the memo never pins a
 * detached DOM subtree after picking stops.
 */
let lastPick: { target: Node; id: number | null } | null = null;

function pushEvent(event: DevtoolsEvent): void {
	if (recording) {
		if (eventCount < DEFAULT_EVENT_BUFFER) {
			events[(eventHead + eventCount) % DEFAULT_EVENT_BUFFER] = event;
			eventCount++;
		} else {
			events[eventHead] = event;
			eventHead = (eventHead + 1) % DEFAULT_EVENT_BUFFER;
		}
	}
	for (const listener of listeners) {
		try {
			listener(event);
		} catch {
			// A faulty panel listener must never affect application rendering.
		}
	}
}

function orderedEvents(): DevtoolsEvent[] {
	const ordered = new Array<DevtoolsEvent>(eventCount);
	for (let index = 0; index < eventCount; index++) {
		ordered[index] = events[(eventHead + index) % DEFAULT_EVENT_BUFFER]!;
	}
	return ordered;
}

function sourceOf(meta: {
	file: string;
	line: number;
	column: number;
}): DevtoolsSourceLocation | null {
	return meta.line > 0 ? { file: meta.file, line: meta.line, column: meta.column } : null;
}

/** Runtime ABI: the single owner of the "line 0 means no authored source" rule. */
export const __devtoolsMetaSource = sourceOf;

function componentInfo(component: Function | undefined): {
	name: string | null;
	source: DevtoolsSourceLocation | null;
} {
	if (component === undefined) return { name: null, source: null };
	const meta = __profileMetadataFor(component);
	return { name: meta.name, source: sourceOf(meta) };
}

function hookInfo(meta: HookProfileMetadata | undefined): {
	name: string | null;
	source: DevtoolsSourceLocation | null;
} {
	if (meta === undefined) return { name: null, source: null };
	return { name: meta.name, source: sourceOf(meta) };
}

const devtools: OctaneDevtools = {
	version: 1,
	isAttached() {
		return adapter !== null;
	},
	subscribe(listener) {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},
	getTree() {
		if (adapter === null) return [];
		const trees: DevtoolsTreeNode[] = [];
		for (const root of liveRoots) {
			try {
				let tree = rootTreeCache.get(root);
				if (tree === undefined) {
					tree = adapter.buildRootNode(root, idFor);
					rootTreeCache.set(root, tree);
				}
				trees.push(tree);
			} catch {
				// A half-torn-down root mid-walk must not take the whole tree with it.
			}
		}
		return trees;
	},
	inspect(id) {
		if (adapter === null) return null;
		const subject = subjectFor(id);
		if (subject === null) return null;
		try {
			return adapter.inspect(subject, id);
		} catch {
			return null;
		}
	},
	getDomNodes(id) {
		if (adapter === null) return [];
		const subject = subjectFor(id);
		if (subject === null) return [];
		try {
			return adapter.domNodes(subject);
		} catch {
			return [];
		}
	},
	findByDomNode(target) {
		if (adapter === null || target === null || typeof target !== 'object') return null;
		if (lastPick !== null && lastPick.target === target) return lastPick.id;
		let id: number | null = null;
		for (const root of liveRoots) {
			try {
				const subject = adapter.findByDomNode(root, target);
				if (subject !== null) {
					id = idFor(subject);
					break;
				}
			} catch {
				// A half-torn-down root must not break the picker for other roots.
			}
		}
		lastPick = { target, id };
		return id;
	},
	getComponentSource(component) {
		if (typeof component !== 'function') return null;
		return sourceOf(__profileMetadataFor(component));
	},
	getEvents() {
		return orderedEvents();
	},
	clearEvents() {
		events = [];
		eventHead = 0;
		eventCount = 0;
	},
	setRecording(next) {
		recording = next === true;
	},
	isRecording() {
		return recording;
	},
	setEffectTelemetry(enabled) {
		effectTelemetry = enabled === true;
	},
	isEffectTelemetryEnabled() {
		return effectTelemetry;
	},
	markContainerInternal(container) {
		if (container !== null && typeof container === 'object') internalContainers.add(container);
	},
	getProfiler() {
		try {
			return globalThis.__OCTANE_PROFILER__;
		} catch {
			return undefined;
		}
	},
};

function installGlobal(): void {
	const target = globalThis as typeof globalThis & {
		__OCTANE_DEVTOOLS__?: OctaneDevtools;
	};
	try {
		if (target.__OCTANE_DEVTOOLS__ !== devtools) target.__OCTANE_DEVTOOLS__ = devtools;
	} catch {
		// A hardened host may reserve or freeze globals; the bridge then stays
		// reachable only through direct `octane/devtools` imports.
	}
}

/** Runtime ABI: connect the instrumented runtime's reflection layer (module evaluation). */
export function __devtoolsInstallRuntime(impl: DevtoolsRuntimeAdapter): void {
	adapter = impl;
	// The bridge's commit signal rides the shared profiling channel — the same
	// real flush boundary scan-style subscribers observe. Registered here (a
	// devtools-gated runtime call), never at module evaluation, so the module
	// stays side-effect-free and production builds keep tree-shaking it away.
	// Set-backed listeners make a repeated install idempotent.
	__profileOnCommit(commitFinished);
	installGlobal();
}

/** Runtime ABI: a public root mounted. Internal (panel-owned) containers are ignored. */
export function __devtoolsRegisterRoot(root: object, container: object): void {
	if (internalContainers.has(container)) {
		internalRoots.add(root);
		return;
	}
	liveRoots.add(root);
	lastPick = null;
	if (hasEventConsumer()) pushEvent({ kind: 'root-added', at: now() });
}

/** Runtime ABI: a public root unmounted or was replaced. */
export function __devtoolsUnregisterRoot(root: object): void {
	rootTreeCache.delete(root);
	if (!liveRoots.delete(root)) return;
	lastPick = null;
	if (hasEventConsumer()) pushEvent({ kind: 'root-removed', at: now() });
}

/**
 * A commit finished — the tree/state may have changed. Registered with the
 * shared profiling commit channel by `__devtoolsInstallRuntime`. `roots`
 * holds the root blocks whose work this commit drained; every render entry
 * point (root mount, hydrate, scheduleRender) attributes its root, so a
 * commit with no attribution rendered nothing new (an effects-only or empty
 * follow-up flush) and is dropped, as is one attributable only to internal
 * (panel-owned) roots — which is what stops the panel's own renders from
 * re-triggering panel refreshes.
 */
function commitFinished(roots: ReadonlySet<object> | null): void {
	lastPick = null;
	if (roots === null || roots.size === 0 || !hasEventConsumer()) return;
	let ids: number[] | undefined;
	for (const root of roots) {
		if (internalRoots.has(root)) continue;
		(ids ??= []).push(idFor(root));
	}
	if (ids === undefined) return;
	pushEvent({ kind: 'commit', at: now(), roots: ids });
}

/** Runtime ABI: effect timing start. -1 disables the paired end call. */
export function __devtoolsEffectStart(): number {
	return effectTelemetry ? now() : -1;
}

/**
 * Runtime ABI: an effect body finished. `scope` is the owning render scope and
 * `block` its component block — whichever carries a tracked component names
 * the event. The runtime translates its internal phase index to the public
 * phase name before crossing this boundary.
 */
export function __devtoolsEffectEnd(
	scope: object,
	block: object | null,
	slot: symbol | number,
	phase: DevtoolsEffectPhase,
	startedAt: number,
): void {
	if (startedAt < 0 || !hasEventConsumer()) return;
	const component =
		__profileTrackedComponentFor(scope) ??
		(block !== null ? __profileTrackedComponentFor(block) : undefined);
	const comp = componentInfo(component);
	const hook = hookInfo(typeof slot === 'symbol' ? __profileHookMetadataFor(slot) : undefined);
	pushEvent({
		kind: 'effect',
		at: startedAt,
		phase,
		duration: Math.max(0, now() - startedAt),
		component: comp.name,
		componentSource: comp.source,
		hook: hook.name,
		hookSource: hook.source,
	});
}

/** Runtime ABI: an HMR update swapped a component body in place. */
export function __devtoolsHmr(component: Function): void {
	// An edit can change labels/sources beyond the instances it re-renders
	// (touch-invalidated), so drop every cached tree — HMR is rare and cheap.
	for (const root of liveRoots) rootTreeCache.delete(root);
	if (!hasEventConsumer()) return;
	pushEvent({ kind: 'hmr', at: now(), component: componentInfo(component).name });
}

/**
 * Runtime ABI: a scope's render is starting — drop its useDebugValue records
 * so a call that stops executing (Octane permits conditional hooks) stops
 * being reported as live state.
 */
export function __devtoolsRenderStarted(scope: object): void {
	if (hasDebugValues) debugValueCells.get(scope)?.clear();
}

/** Runtime ABI: a `useDebugValue(value, format?)` call during a render. */
export function __devtoolsDebugValue(
	scope: object,
	slot: symbol | number,
	value: unknown,
	format: unknown,
): void {
	hasDebugValues = true;
	let cells = debugValueCells.get(scope);
	if (cells === undefined) debugValueCells.set(scope, (cells = new Map()));
	const cell = cells.get(slot);
	const nextFormat =
		typeof format === 'function' ? (format as DebugValueCell['format']) : undefined;
	if (cell !== undefined) {
		cell.value = value;
		cell.format = nextFormat;
	} else {
		cells.set(slot, { value, format: nextFormat });
	}
}

/**
 * Parse the owning custom hook's name out of a `file#Name@line:col` metadata
 * id. Anchored at the end and constrained to identifier characters so a `#`
 * or `@` inside the file path cannot split the wrong segment.
 */
const METADATA_ID_OWNER = /#([A-Za-z_$][A-Za-z0-9_$]*)@\d+:\d+$/;

function debugValueOwner(componentId: string | undefined): string | null {
	if (componentId === undefined) return null;
	return METADATA_ID_OWNER.exec(componentId)?.[1] ?? null;
}

/** Runtime ABI: the scope's recorded debug values, formatted now (inspect time). */
export function __devtoolsDebugValuesFor(scope: object): DevtoolsDebugValue[] {
	const cells = debugValueCells.get(scope);
	if (cells === undefined) return [];
	const out: DevtoolsDebugValue[] = [];
	let order = 0;
	for (const [slot, cell] of cells) {
		const meta = typeof slot === 'symbol' ? __profileHookMetadataFor(slot) : undefined;
		let value = cell.value;
		if (cell.format !== undefined) {
			try {
				value = cell.format(cell.value);
			} catch {
				// The formatter is application code; a throwing one must not take
				// down the inspector — fall back to the raw value.
			}
		}
		out.push({
			order: order++,
			owner: debugValueOwner(meta?.componentId),
			source: meta !== undefined ? sourceOf(meta) : null,
			value,
		});
	}
	return out;
}

/** The bridge singleton, for same-realm consumers that prefer an import over the global. */
export const octaneDevtools: OctaneDevtools = devtools;
