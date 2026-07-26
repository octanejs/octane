// packages/octane/src/devtools-hook.ts
//
// Dev-only runtime DevTools hook. EVERY call site in runtime.ts is guarded by
// __OCTANE_PROFILE_ENABLED__, so a normal production build never references this
// module and Rollup tree-shakes it away. It reads scopes STRUCTURALLY (no import
// from runtime.ts) to avoid a module cycle; runtime.ts hands us the name resolver
// via __devtoolsSetNameResolver so we don't duplicate its HMR-unwrapping logic.

export const DEVTOOLS_HOOK_VERSION = 2;

/** The subset of a runtime Scope/Block the walker reads. */
export interface DevtoolsScopeLike {
	kind?: string; // Block.kind ('root' | 'control-flow' | ...); absent on leaf scopes
	body?: unknown; // Block.body (the component function); used by the name resolver
	hooks: Map<symbol | number, any> | null;
	effectSlots: any[] | null;
	// Lazily allocated by the runtime — null on a scope that never registered a child.
	children: Array<{ key: symbol | string | number; scope: DevtoolsScopeLike }> | null;
	$$ctxValues?: Map<any, any> | null;
}

export interface DevtoolsTreeNode {
	id: number;
	name: string;
	kind: string; // 'root' | 'control-flow' | 'dynamic' | 'portal' | 'component'
	children: DevtoolsTreeNode[];
}

export type DevtoolsHookKind = 'state' | 'reducer' | 'ref' | 'memo-or-callback' | 'other';

export interface DevtoolsHookCell {
	kind: DevtoolsHookKind;
	value: unknown; // JSON-safe shallow preview
}

export interface DevtoolsNodeDetail {
	id: number;
	name: string;
	hooks: DevtoolsHookCell[];
	context: Array<{ name: string; value: unknown }>;
	effectCount: number;
}

export type DevtoolsBoundaryState = 'init' | 'catch' | 'resolved' | 'pending';

export interface DevtoolsBoundary {
	id: number;
	branch: number;
	state: DevtoolsBoundaryState;
	hasResolved: boolean;
	label: string;
}

export interface DevtoolsTransitionState {
	pendingCount: number;
	boundaries: DevtoolsBoundary[];
}

export interface OctaneDevtoolsHook {
	version: number;
	getTree(): DevtoolsTreeNode[];
	inspect(id: number): DevtoolsNodeDetail | null;
	subscribe(listener: () => void): () => void;
	getTransitionState(): DevtoolsTransitionState;
}

const roots = new Set<DevtoolsScopeLike>();
const subscribers = new Set<() => void>();
const ids = new WeakMap<object, number>();
let nextId = 1;
// Rebuilt on every getTree() walk: inspect(id) only resolves nodes from the most
// recent tree (exactly the panel's contract), and replacing the map each walk
// means unmounted scopes are not retained here.
let idIndex = new Map<number, DevtoolsScopeLike>();

let nameResolver: (block: any) => string = (b) =>
	(b && b.body && (b.body.displayName || b.body.name)) || 'Unknown';

let transitionPendingCount = 0;
const boundaries = new Map<number, DevtoolsBoundary>();

function branchToState(branch: number): DevtoolsBoundaryState {
	// TrySlot legend: -1 init, 0 catch, 1 try (resolved), 2 pending.
	if (branch === 0) return 'catch';
	if (branch === 1) return 'resolved';
	if (branch === 2) return 'pending';
	return 'init';
}

function idOf(scope: object): number {
	let id = ids.get(scope);
	if (id === undefined) {
		id = nextId++;
		ids.set(scope, id);
	}
	return id;
}

function safePreview(value: unknown, depth = 0): unknown {
	if (value === null || value === undefined) return value;
	const t = typeof value;
	if (t === 'string' || t === 'boolean') return value;
	if (t === 'number') return Number.isFinite(value as number) ? value : String(value);
	if (t === 'bigint') return `${value}n`;
	if (t === 'function') return '[Function]';
	if (t === 'symbol') return String(value);
	if (depth >= 2) return Array.isArray(value) ? '[Array]' : '[Object]';
	if (typeof Node !== 'undefined' && value instanceof Node) return `[${(value as Node).nodeName}]`;
	if (Array.isArray(value)) return value.slice(0, 20).map((v) => safePreview(v, depth + 1));
	const out: Record<string, unknown> = {};
	let n = 0;
	for (const key of Object.keys(value as object)) {
		if (n++ >= 20) break;
		out[key] = safePreview((value as any)[key], depth + 1);
	}
	return out;
}

function classifyCell(cell: any): DevtoolsHookCell | null {
	if (cell === null || typeof cell !== 'object') return null;
	// Effect slots are reported separately as `effectCount`; skip them here so
	// they don't also surface as untyped `other` rows in the hook list.
	if (cell.effect === true) return null;
	if ('setter' in cell) return { kind: 'state', value: safePreview(cell.value) };
	if ('dispatch' in cell && 'reducer' in cell)
		return { kind: 'reducer', value: safePreview(cell.value) };
	if ('current' in cell && !('deps' in cell))
		return { kind: 'ref', value: safePreview(cell.current) };
	if ('deps' in cell && 'value' in cell)
		return { kind: 'memo-or-callback', value: safePreview(cell.value) };
	return { kind: 'other', value: safePreview(cell) };
}

function nameOf(scope: DevtoolsScopeLike, key: symbol | string | number | undefined): string {
	if (scope.body != null || scope.kind != null) return nameResolver(scope);
	return key === undefined ? 'scope' : String(key);
}

function buildNode(
	scope: DevtoolsScopeLike,
	key: symbol | string | number | undefined,
): DevtoolsTreeNode {
	const id = idOf(scope);
	idIndex.set(id, scope);
	return {
		id,
		name: nameOf(scope, key),
		kind: scope.kind ?? 'component',
		children: scope.children === null ? [] : scope.children.map((c) => buildNode(c.scope, c.key)),
	};
}

const hook: OctaneDevtoolsHook = {
	version: DEVTOOLS_HOOK_VERSION,
	getTree() {
		idIndex = new Map();
		return [...roots].map((r) => buildNode(r, undefined));
	},
	inspect(id) {
		const scope = idIndex.get(id);
		if (scope === undefined) return null;
		const hooks: DevtoolsHookCell[] = [];
		if (scope.hooks) {
			for (const cell of scope.hooks.values()) {
				const classified = classifyCell(cell);
				if (classified) hooks.push(classified);
			}
		}
		const context: Array<{ name: string; value: unknown }> = [];
		if (scope.$$ctxValues) {
			for (const [ctx, value] of scope.$$ctxValues) {
				context.push({
					name: (ctx && (ctx.displayName || ctx.name)) || 'Context',
					value: safePreview(value),
				});
			}
		}
		return {
			id,
			name: nameOf(scope, undefined),
			hooks,
			context,
			effectCount: scope.effectSlots ? scope.effectSlots.length : 0,
		};
	},
	subscribe(listener) {
		subscribers.add(listener);
		return () => {
			subscribers.delete(listener);
		};
	},
	getTransitionState() {
		return {
			pendingCount: transitionPendingCount,
			boundaries: [...boundaries.values()],
		};
	},
};

declare global {
	// eslint-disable-next-line no-var
	var __OCTANE_DEVTOOLS__: OctaneDevtoolsHook | undefined;
}

export function installDevtoolsGlobal(): void {
	const target = globalThis as typeof globalThis & { __OCTANE_DEVTOOLS__?: OctaneDevtoolsHook };
	try {
		if (target.__OCTANE_DEVTOOLS__ !== hook) target.__OCTANE_DEVTOOLS__ = hook;
	} catch {
		// A hardened host may freeze globals; the runtime still functions.
	}
}

export function __devtoolsSetNameResolver(fn: (block: any) => string): void {
	nameResolver = fn;
}

export function __devtoolsRegisterRoot(root: DevtoolsScopeLike): void {
	roots.add(root);
	installDevtoolsGlobal();
}

export function __devtoolsUnregisterRoot(root: DevtoolsScopeLike): void {
	roots.delete(root);
}

export function __devtoolsNotifyFlush(): void {
	if (subscribers.size === 0) return;
	for (const listener of subscribers) {
		try {
			listener();
		} catch (err) {
			console.error(err);
		}
	}
}

export function __devtoolsSetTransitionCount(count: number): void {
	transitionPendingCount = count < 0 ? 0 : count;
}

export function __devtoolsSetBoundaryState(
	slot: object,
	branch: number,
	hasResolved: boolean,
	label: string,
): void {
	const id = idOf(slot);
	boundaries.set(id, { id, branch, state: branchToState(branch), hasResolved, label });
}

export function __devtoolsClearBoundary(slot: object): void {
	boundaries.delete(idOf(slot));
}
