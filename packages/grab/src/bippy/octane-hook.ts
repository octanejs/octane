// Octane devtools-hook access for the bippy-compat layer. The hook exists only
// in profile/devtools builds (`__OCTANE_PROFILE_ENABLED__`), matching bippy's
// own constraint that instrumentation needs the React devtools hook installed
// by a development React build.

export interface OctaneScopeLike {
	kind?: string;
	body?: unknown;
	hooks?: Map<symbol | number, unknown> | null;
	effectSlots?: unknown[] | null;
	children?: Array<{ key: symbol | string | number; scope: OctaneScopeLike }> | null;
	$$ctxValues?: Map<unknown, unknown> | null;
	disposed?: boolean;
	parent?: OctaneScopeLike | null;
	parentBlock?: OctaneScopeLike | null;
	parentNode?: Node | null;
	startMarker?: Node | null;
	endMarker?: Node | null;
	props?: unknown;
	locs?: Record<number, [number, number]>;
	locFile?: string;
}

export interface OctaneDevtoolsHookLike {
	version: number;
	getRoots?: () => readonly OctaneScopeLike[];
	childrenOf?: (
		scope: OctaneScopeLike,
	) => ReadonlyArray<{ key: symbol | string | number | undefined; scope: OctaneScopeLike }>;
	subscribe?: (listener: () => void) => () => void;
}

export const getOctaneDevtoolsHook = (): OctaneDevtoolsHookLike | null => {
	const hook = (globalThis as { __OCTANE_DEVTOOLS__?: OctaneDevtoolsHookLike }).__OCTANE_DEVTOOLS__;
	if (hook === undefined || hook === null) return null;
	if (typeof hook.getRoots !== 'function' || typeof hook.childrenOf !== 'function') return null;
	return hook;
};

export const isOctaneInstrumentationActive = (): boolean => getOctaneDevtoolsHook() !== null;

/**
 * DOM nodes owned by a scope: the siblings between its markers inside
 * `parentNode`, or `parentNode`'s children when the scope carries no markers
 * (e.g. a root block).
 */
export const scopeDomNodes = (scope: OctaneScopeLike): Node[] => {
	const parentNode = scope.parentNode;
	if (parentNode === undefined || parentNode === null) return [];
	const { startMarker, endMarker } = scope;
	const nodes: Node[] = [];
	let node =
		startMarker !== undefined && startMarker !== null ? startMarker : parentNode.firstChild;
	while (node !== null) {
		nodes.push(node);
		if (node === endMarker) break;
		node = node.nextSibling;
	}
	return nodes;
};

export const scopeContainsNode = (scope: OctaneScopeLike, target: Node): boolean => {
	for (const node of scopeDomNodes(scope)) {
		if (node === target || node.contains(target)) return true;
	}
	return false;
};

export const firstElementOfScope = (scope: OctaneScopeLike): Element | null => {
	for (const node of scopeDomNodes(scope)) {
		if (node.nodeType === 1) return node as Element;
	}
	return null;
};

/** Top-level elements inside a scope's DOM range. */
export const scopeTopLevelElements = (scope: OctaneScopeLike): Element[] => {
	return scopeDomNodes(scope).filter((node): node is Element => node.nodeType === 1);
};

export const scopeChildrenOf = (
	hook: OctaneDevtoolsHookLike | null,
	scope: OctaneScopeLike,
): ReadonlyArray<{ key: symbol | string | number | undefined; scope: OctaneScopeLike }> =>
	hook?.childrenOf?.(scope) ?? [];

const parentRecordCache = new WeakMap<
	OctaneScopeLike,
	{ parent: OctaneScopeLike; key: symbol | string | number | undefined } | null
>();

/**
 * The record that created a scope: its parent scope plus the slot key the
 * parent's template used. The parent's `locs[key]` then names the usage site's
 * source position — Octane's equivalent of React's `_debugSource`.
 */
export const scopeParentRecord = (
	hook: OctaneDevtoolsHookLike | null,
	scope: OctaneScopeLike,
): { parent: OctaneScopeLike; key: symbol | string | number | undefined } | null => {
	if (hook === null) return null;
	if (parentRecordCache.has(scope)) return parentRecordCache.get(scope) ?? null;
	const direct = scope.parent ?? scope.parentBlock ?? null;
	if (direct !== null) {
		for (const entry of scopeChildrenOf(hook, direct)) {
			if (entry.scope === scope) {
				const record = { parent: direct, key: entry.key };
				parentRecordCache.set(scope, record);
				return record;
			}
		}
		const fallback = { parent: direct, key: undefined };
		parentRecordCache.set(scope, fallback);
		return fallback;
	}
	for (const root of hook.getRoots?.() ?? []) {
		for (const entry of scopeChildrenOf(hook, root)) {
			if (entry.scope === scope) {
				const record = { parent: root, key: entry.key };
				parentRecordCache.set(scope, record);
				return record;
			}
		}
	}
	parentRecordCache.set(scope, null);
	return null;
};

/** Resolve `scope`'s JSX usage site: `parent.locs[slotKey]` inside `parent.locFile`. */
export const scopeUsageSite = (
	hook: OctaneDevtoolsHookLike,
	scope: OctaneScopeLike,
): { fileName: string; lineNumber: number; columnNumber: number } | null => {
	const record = scopeParentRecord(hook, scope);
	if (record === null || record.key === undefined || typeof record.key !== 'number') return null;
	const loc = record.parent.locs?.[record.key];
	if (loc === undefined) return null;
	return {
		fileName: record.parent.locFile ?? '<unknown>',
		lineNumber: loc[0],
		columnNumber: loc[1],
	};
};

const bodyLocPattern = /["']__octane_loc:([^"'\\\s]+)['"]/;

/** A component body's stamped definition site (`__oct_loc` / `__octane_loc:` marker). */
export const scopeDefinitionSite = (
	scope: OctaneScopeLike,
): { fileName: string; lineNumber: number; columnNumber: number } | null => {
	const body = scope.body;
	if (typeof body !== 'function') return null;
	let stamped: string | undefined;
	try {
		const value = (body as { __oct_loc?: unknown }).__oct_loc;
		if (typeof value === 'string') stamped = value;
	} catch {
		return null;
	}
	if (stamped === undefined) {
		try {
			const match = bodyLocPattern.exec(Function.prototype.toString.call(body));
			if (match !== null) stamped = decodeURIComponent(match[1]);
		} catch {
			return null;
		}
	}
	if (stamped === undefined) return null;
	const match = /^(.*):(\d+):(\d+)$/.exec(stamped);
	if (match === null) return null;
	return {
		fileName: match[1],
		lineNumber: Number(match[2]),
		columnNumber: Number(match[3]),
	};
};
