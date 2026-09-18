// bippy compatibility layer backed by Octane's devtools hook.
//
// Upstream react-grab inspects React fibers through bippy. Octane scopes carry
// the same contract — component body, parent chain, keyed child records, DOM
// marker ranges, and dev source locations — so this module preserves the
// bippy-shaped call sites over `__OCTANE_DEVTOOLS__` (present only in
// profile/devtools builds). `Fiber` values are thin facades over live scopes.

import {
	firstElementOfScope,
	getOctaneDevtoolsHook,
	isOctaneInstrumentationActive,
	scopeContainsNode,
	scopeChildrenOf,
	scopeParentRecord,
	scopeTopLevelElements,
	type OctaneDevtoolsHookLike,
	type OctaneScopeLike,
} from './octane-hook.js';

// Public fiber contract: only members with an upstream-fiber counterpart. The
// Octane scope behind a fiber is internal plumbing — `ScopedFiber` exposes it.
export interface Fiber {
	readonly key: string | null;
	readonly return: Fiber | null;
	readonly child: Fiber | null;
	readonly sibling: Fiber | null;
	readonly type: unknown;
	readonly elementType: unknown;
	readonly stateNode: Node | null;
	readonly memoizedProps: Record<string, unknown> | null;
	readonly _debugOwner: Fiber | undefined;
	readonly _debugStack?: Error;
	readonly isHost: boolean;
}

export interface ScopedFiber extends Fiber {
	readonly scope: OctaneScopeLike | null;
	readonly return: ScopedFiber | null;
	readonly child: ScopedFiber | null;
	readonly sibling: ScopedFiber | null;
	readonly _debugOwner: ScopedFiber | undefined;
}

const createScopeFiber = (
	scope: OctaneScopeLike,
	parent: ScopedFiber | null,
	key: string | null,
): ScopedFiber => {
	const self: ScopedFiber = {
		scope,
		key,
		return: parent,
		get child() {
			const first = scopeChildrenOf(hookOrNull(), scope)[0];
			return first ? createScopeFiber(first.scope, self, keyOf(first.key)) : null;
		},
		get sibling() {
			const parentScope = parent?.scope;
			if (parentScope === null || parentScope === undefined) return null;
			const siblings = scopeChildrenOf(hookOrNull(), parentScope);
			const index = siblings.findIndex((entry) => entry.scope === scope);
			const next = index >= 0 ? siblings[index + 1] : undefined;
			return next ? createScopeFiber(next.scope, parent, keyOf(next.key)) : null;
		},
		get type() {
			return scope.body;
		},
		get elementType() {
			return scope.body;
		},
		get stateNode() {
			return firstElementOfScope(scope);
		},
		get memoizedProps() {
			return scope.props !== null && typeof scope.props === 'object'
				? (scope.props as Record<string, unknown>)
				: null;
		},
		get _debugOwner() {
			return parent ?? undefined;
		},
		isHost: false,
	};
	return self;
};

const createHostFiber = (element: Element, parent: ScopedFiber | null): ScopedFiber => ({
	scope: null,
	key: null,
	return: parent,
	child: null,
	sibling: null,
	type: typeof element.tagName === 'string' ? element.tagName.toLowerCase() : element.tagName,
	elementType:
		typeof element.tagName === 'string' ? element.tagName.toLowerCase() : element.tagName,
	stateNode: element,
	memoizedProps: null,
	_debugOwner: parent ?? undefined,
	isHost: true,
});

const keyOf = (key: symbol | string | number | undefined): string | null =>
	key === undefined ? null : String(key);

const hookOrNull = (): OctaneDevtoolsHookLike | null => getOctaneDevtoolsHook();

export const isInstrumentationActive = (): boolean => isOctaneInstrumentationActive();

export const isFiber = (value: unknown): value is Fiber =>
	typeof value === 'object' &&
	value !== null &&
	('scope' in value || 'isHost' in value) &&
	'stateNode' in value;

export const isCompositeFiber = (fiber: ScopedFiber): boolean =>
	!fiber.isHost && typeof fiber.scope?.body === 'function';

export const isHostFiber = (fiber: Fiber): boolean => fiber.isHost === true;

const fiberCache = new WeakMap<OctaneScopeLike, ScopedFiber>();

export const scopeFiberOf = (scope: OctaneScopeLike): ScopedFiber => {
	const cached = fiberCache.get(scope);
	if (cached !== undefined) return cached;
	const record = scopeParentRecord(hookOrNull(), scope);
	const parentFiber = record !== null ? scopeFiberOf(record.parent) : null;
	const fiber = createScopeFiber(scope, parentFiber, keyOf(record?.key));
	fiberCache.set(scope, fiber);
	return fiber;
};

const deepestScopeContaining = (scope: OctaneScopeLike, target: Node): OctaneScopeLike | null => {
	if (!scopeContainsNode(scope, target)) return null;
	const hook = hookOrNull();
	if (hook === null) return scope;
	for (const entry of scopeChildrenOf(hook, scope)) {
		if (entry.scope.disposed === true) continue;
		const deeper = deepestScopeContaining(entry.scope, target);
		if (deeper !== null) return deeper;
	}
	return scope;
};

// Upstream accepts any host instance (including non-DOM ones like R3F
// objects). On Octane only DOM elements resolve — other instances return null.
export const getFiberFromHostInstance = (instance: unknown): ScopedFiber | null => {
	if (!(instance instanceof Element)) return null;
	const element = instance;
	const hook = hookOrNull();
	if (hook === null) return null;
	let best: OctaneScopeLike | null = null;
	for (const root of hook.getRoots?.() ?? []) {
		const found = deepestScopeContaining(root, element);
		if (found !== null) {
			best = found;
			break;
		}
	}
	if (best === null) return null;
	// Prefer the nearest composite (component) scope: upstream resolves the
	// fiber OWNING the host node, which for React is the host fiber itself but
	// for Octane is the component block whose range contains the element.
	let current: OctaneScopeLike | null = best;
	while (current !== null && typeof current.body !== 'function') {
		current = current.parent ?? current.parentBlock ?? null;
	}
	return scopeFiberOf(current ?? best);
};

export const getLatestFiber = <T extends Fiber>(fiber: T): T => fiber;

export const traverseFiber = (
	fiber: ScopedFiber,
	visit: (fiber: ScopedFiber) => boolean | void,
	traverseReturn = false,
): void => {
	const hook = hookOrNull();
	if (traverseReturn) {
		let current: ScopedFiber | null = fiber;
		while (current !== null) {
			if (visit(current) === true) return;
			current = current.return;
		}
		return;
	}
	if (hook === null) return;
	const stack: ScopedFiber[] = [fiber];
	while (stack.length > 0) {
		const current = stack.pop();
		if (current === undefined) break;
		if (visit(current) === true) return;
		const scope = current.scope;
		if (scope === null || scope === undefined) continue;
		const children = scopeChildrenOf(hook, scope);
		for (let index = children.length - 1; index >= 0; index -= 1) {
			const entry = children[index];
			if (entry.scope.disposed === true) continue;
			stack.push(createScopeFiber(entry.scope, current, keyOf(entry.key)));
		}
	}
};

export const getDisplayName = (type: unknown): string | null => {
	if (typeof type === 'function') {
		const fn = type as { displayName?: string; name?: string };
		return fn.displayName ?? (fn.name !== undefined && fn.name !== '' ? fn.name : null);
	}
	if (typeof type === 'string') return type;
	if (typeof type === 'object' && type !== null) {
		const candidate = type as { displayName?: string; name?: string };
		return candidate.displayName ?? candidate.name ?? null;
	}
	return null;
};

export interface FiberRoot {
	current: Fiber;
	scope: OctaneScopeLike;
}

export interface ReactRenderer {
	version?: string;
	bundleType?: number;
}

export const _fiberRoots = new Set<string>();

export const getRDTHook = (): OctaneDevtoolsHookLike | null => hookOrNull();

interface InstrumentOptions {
	name?: string;
	onActive?: () => void;
	onCommitFiberRoot?: (rendererId: number, root: FiberRoot, priority?: unknown) => void;
	onCommitFiberUnmount?: (rendererId: number, fiber: Fiber) => void;
}

export const instrument = (options: InstrumentOptions): void => {
	const hook = hookOrNull();
	if (hook === null || options.onCommitFiberRoot === undefined) return;
	const onCommitFiberRoot = options.onCommitFiberRoot;
	hook.subscribe?.(() => {
		for (const root of hook.getRoots?.() ?? []) {
			onCommitFiberRoot(0, { current: scopeFiberOf(root), scope: root });
		}
	});
};

export const getNearestHostFibers = (fiber: ScopedFiber): Fiber[] => {
	const scope = fiber.scope;
	if (scope === null || scope === undefined) return [];
	return scopeTopLevelElements(scope).map((element) => createHostFiber(element, fiber));
};
