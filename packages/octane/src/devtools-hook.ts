// packages/octane/src/devtools-hook.ts
//
// Dev-only runtime DevTools hook. EVERY call site in runtime.ts is guarded by
// __OCTANE_PROFILE_ENABLED__, so a normal production build never references this
// module and Rollup tree-shakes it away. It reads scopes STRUCTURALLY (no import
// from runtime.ts) to avoid a module cycle; runtime.ts hands us the name resolver
// via __devtoolsSetNameResolver so we don't duplicate its HMR-unwrapping logic.

import type {
	NativeReadAttemptInspection,
	NativeReadObservation,
} from './signals/native-read-inspection.js';

export const DEVTOOLS_HOOK_VERSION = 3;

/** The subset of a runtime Scope/Block the walker reads. */
export interface DevtoolsScopeLike {
	kind?: string; // Block.kind ('root' | 'control-flow' | ...); absent on leaf scopes
	body?: unknown; // Block.body (the component function); used by the name resolver
	hooks: Map<symbol | number, any> | null;
	effectSlots: any[] | null;
	// Lazily allocated by the runtime — null on a scope that never registered a child.
	children: Array<{ key: symbol | string | number; scope: DevtoolsScopeLike }> | null;
	$$ctxValues?: Map<any, any> | null;
	disposed?: boolean;
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
	nativeReads?: DevtoolsNativeReadOwner;
}

export interface DevtoolsNativeReadOwner {
	/** The actual schedulable renderer Block; a lightweight Scope may share it. */
	ownerId: number;
	committed: NativeReadAttemptInspection | null;
	pending: readonly NativeReadAttemptInspection[];
	retry: readonly NativeReadObservation[];
}

export interface DevtoolsNativeReadInspection extends Omit<DevtoolsNativeReadOwner, 'ownerId'> {
	block: DevtoolsScopeLike;
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

let childWalker:
	((scope: DevtoolsScopeLike, visit: (child: DevtoolsScopeLike) => void) => void) | null = null;
let nativeReadInspector:
	((scope: DevtoolsScopeLike) => DevtoolsNativeReadInspection | null) | null = null;

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
	try {
		if (depth >= 2) return Array.isArray(value) ? '[Array]' : '[Object]';
		if (typeof Node !== 'undefined' && value instanceof Node) return '[Node]';
		const fields = Object.getOwnPropertyDescriptors(value);
		if (Array.isArray(value)) {
			const length = Math.min(Number(fields.length?.value) || 0, 20);
			return Array.from({ length }, (_, index) => previewField(fields[index], depth));
		}
		const out: Record<string, unknown> = {};
		let n = 0;
		for (const key of Object.keys(fields)) {
			const field = fields[key];
			if (!field.enumerable) continue;
			if (n++ >= 20) break;
			Object.defineProperty(out, key, {
				value: previewField(field, depth),
				enumerable: true,
				configurable: true,
				writable: true,
			});
		}
		return out;
	} catch {
		// Proxies or host objects can reject structural inspection.
		return '[Unavailable]';
	}
}

function previewField(field: PropertyDescriptor | undefined, depth: number): unknown {
	if (field === undefined) return undefined;
	return 'value' in field ? safePreview(field.value, depth + 1) : '[Getter]';
}

function classifyCell(cell: any): DevtoolsHookCell | null {
	if (cell === null || typeof cell !== 'object') return null;
	let fields: Record<string, PropertyDescriptor>;
	try {
		fields = Object.getOwnPropertyDescriptors(cell);
	} catch {
		return { kind: 'other', value: '[Unavailable]' };
	}
	// Effect slots are reported separately as `effectCount`; skip them here so
	// they don't also surface as untyped `other` rows in the hook list.
	if (fields.effect?.value === true) return null;
	if ('setter' in fields) return { kind: 'state', value: previewField(fields.value, -1) };
	if ('dispatch' in fields && 'reducer' in fields)
		return { kind: 'reducer', value: previewField(fields.value, -1) };
	if ('current' in fields && !('deps' in fields))
		return { kind: 'ref', value: previewField(fields.current, -1) };
	if ('deps' in fields && 'value' in fields)
		return { kind: 'memo-or-callback', value: previewField(fields.value, -1) };
	return { kind: 'other', value: safePreview(cell) };
}

function nameOf(scope: DevtoolsScopeLike, key: symbol | string | number | undefined): string {
	if (scope.body != null || scope.kind != null) return nameResolver(scope);
	const component = nameResolver(scope);
	if (component !== 'Unknown') return component;
	return key === undefined ? 'scope' : String(key);
}

function buildNode(
	scope: DevtoolsScopeLike,
	key: symbol | string | number | undefined,
	seen: Set<DevtoolsScopeLike>,
): DevtoolsTreeNode | null {
	if (scope.disposed || seen.has(scope)) return null;
	seen.add(scope);
	const id = idOf(scope);
	idIndex.set(id, scope);
	const children: DevtoolsTreeNode[] = [];
	if (scope.children !== null) {
		for (const child of scope.children) {
			const node = buildNode(child.scope, child.key, seen);
			if (node !== null) children.push(node);
		}
	}
	childWalker?.(scope, (child) => {
		const node = buildNode(child, undefined, seen);
		if (node !== null) children.push(node);
	});
	return {
		id,
		name: nameOf(scope, key),
		kind: scope.kind ?? 'component',
		children,
	};
}

const hook: OctaneDevtoolsHook = {
	version: DEVTOOLS_HOOK_VERSION,
	getTree() {
		idIndex = new Map();
		const seen = new Set<DevtoolsScopeLike>();
		const nodes: DevtoolsTreeNode[] = [];
		for (const root of roots) {
			const node = buildNode(root, undefined, seen);
			if (node !== null) nodes.push(node);
		}
		return nodes;
	},
	inspect(id) {
		const scope = idIndex.get(id);
		if (scope === undefined || scope.disposed) return null;
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
		const detail: DevtoolsNodeDetail = {
			id,
			name: nameOf(scope, undefined),
			hooks,
			context,
			effectCount: scope.effectSlots ? scope.effectSlots.length : 0,
		};
		const native = nativeReadInspector?.(scope);
		if (native !== undefined && native !== null) {
			detail.nativeReads = {
				ownerId: idOf(native.block),
				committed: native.committed,
				pending: native.pending,
				retry: native.retry,
			};
		}
		return detail;
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

export function __devtoolsSetChildWalker(walk: typeof childWalker): void {
	childWalker = walk;
}

export function __devtoolsSetNativeReadInspector(inspect: typeof nativeReadInspector): void {
	nativeReadInspector = inspect;
}

export function __devtoolsRegisterRoot(root: DevtoolsScopeLike): void {
	roots.add(root);
	installDevtoolsGlobal();
}

export function __devtoolsUnregisterRoot(root: DevtoolsScopeLike): void {
	roots.delete(root);
	// Drop obsolete scopes immediately without invalidating another root's
	// selection. The existing weak ids keep surviving nodes stable.
	hook.getTree();
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
