/**
 * Bippy-shaped inspection surface for `@octanejs/grab`.
 *
 * Replaces `bippy` / `bippy/source` (reimplement-in-parent). Prefer wiring through
 * `octane/inspect` when present; fall back to honest stubs until host stamps land.
 *
 * Fiber is an opaque Octane owner handle with the fiber-like fields grab reads
 * (`return`, `child`, `sibling`, `stateNode`, `type`, debug fields). It is not a
 * React Fiber.
 */

import {
	getOwnerFromHostInstance,
	getOwnerStack as inspectGetOwnerStack,
	getOwnerStackFromHost,
	isInstrumentationActive as inspectIsInstrumentationActive,
	pauseUpdates,
	type InspectOwner,
	type InspectSourceFrame,
} from 'octane/inspect';

declare const __OCTANE_PROFILE_ENABLED__: boolean | undefined;

/** Opaque owner handle with fiber-shaped fields for grab's adapted bippy call sites. */
export interface Fiber {
	readonly handle: object;
	return: Fiber | null;
	child: Fiber | null;
	sibling: Fiber | null;
	stateNode: object | null;
	type: object | string | number | null;
	key: string | number | null;
	alternate: Fiber | null;
	tag: number;
	elementType: object | string | null;
	memoizedProps: object | null;
	_debugOwner: Fiber | null;
	_debugSource: { fileName?: string; lineNumber?: number; columnNumber?: number } | null;
	_debugStack: Error | null;
}

export interface FiberRoot {
	current: Fiber | null;
}

export interface ReactRenderer {
	rendererPackageName?: string;
	findFiberByHostInstance?: (hostInstance: object) => Fiber | null;
}

export interface StackFrame {
	args?: Array<string | number | boolean | null | undefined>;
	columnNumber?: number;
	lineNumber?: number;
	enclosingLineNumber?: number;
	enclosingColumnNumber?: number;
	fileName?: string;
	functionName?: string;
	source?: string;
	isServer?: boolean;
	isSymbolicated?: boolean;
	isIgnoreListed?: boolean;
}

/** Tracked roots for freeze-updates compatibility; Octane uses pauseUpdates instead. */
export const _fiberRoots: Set<FiberRoot> = new Set();

let instrumentationFlag = false;
let resumeFreeze: (() => void) | null = null;

const ownerToFiber = new WeakMap<object, Fiber>();

function frameToStackFrame(frame: InspectSourceFrame): StackFrame {
	return {
		functionName: frame.name,
		fileName: frame.fileName ?? undefined,
		lineNumber: frame.lineNumber ?? undefined,
		columnNumber: frame.columnNumber ?? undefined,
	};
}

function wrapOwner(owner: InspectOwner, host?: Element | null): Fiber {
	const existing = ownerToFiber.get(owner.handle);
	if (existing) {
		if (host != null) existing.stateNode = host;
		return existing;
	}
	const fiber: Fiber = {
		handle: owner.handle,
		return: null,
		child: null,
		sibling: null,
		stateNode: host ?? null,
		type: owner.displayName || 'Anonymous',
		key: null,
		alternate: null,
		tag: 0,
		elementType: owner.displayName || 'Anonymous',
		memoizedProps: null,
		_debugOwner: null,
		_debugSource: owner.source
			? {
					fileName: owner.source.fileName ?? undefined,
					lineNumber: owner.source.lineNumber ?? undefined,
					columnNumber: owner.source.columnNumber ?? undefined,
				}
			: null,
		_debugStack: null,
	};
	ownerToFiber.set(owner.handle, fiber);

	// Build parent chain from inspect stack (leaf-first frames → parent links).
	const frames = inspectGetOwnerStack(owner);
	if (frames.length > 1) {
		// Parent owner is the next frame's handle when available via host walk.
		// Without block handles for ancestors, leave return null; getOwnerStack
		// still serves copy/context via the inspect API.
	}
	return fiber;
}

export function getFiberFromHostInstance(hostInstance: unknown): Fiber | null {
	if (hostInstance == null || typeof hostInstance !== 'object') return null;
	const node = hostInstance as Node;
	if (typeof (node as Node).nodeType !== 'number') return null;
	const owner = getOwnerFromHostInstance(node);
	if (!owner) return null;
	return wrapOwner(owner, node.nodeType === 1 ? (node as Element) : null);
}

export function getLatestFiber(fiber: Fiber | null | undefined): Fiber | null {
	return fiber ?? null;
}

export function getDisplayName(type: unknown): string | null {
	if (typeof type === 'string') return type;
	if (typeof type === 'function') {
		const named = (type as { displayName?: string; name?: string }).displayName || type.name;
		return named || null;
	}
	if (type && typeof type === 'object' && 'displayName' in (type as object)) {
		const name = (type as { displayName?: string }).displayName;
		return typeof name === 'string' ? name : null;
	}
	return null;
}

export function isCompositeFiber(fiber: Fiber | null | undefined): boolean {
	return fiber != null && fiber.stateNode == null;
}

export function isHostFiber(fiber: Fiber | null | undefined): boolean {
	return (
		fiber != null &&
		fiber.stateNode != null &&
		typeof (fiber.stateNode as Node).nodeType === 'number'
	);
}

export function getNearestHostFibers(fiber: Fiber | null | undefined): Fiber[] {
	if (!fiber) return [];
	if (isHostFiber(fiber)) return [fiber];
	const hosts: Fiber[] = [];
	traverseFiber(fiber, (current) => {
		if (isHostFiber(current)) hosts.push(current);
		return false;
	});
	return hosts;
}

export function traverseFiber(
	fiber: Fiber | null | undefined,
	visitor: (fiber: Fiber) => boolean | void,
): void {
	if (!fiber) return;
	const stack: Fiber[] = [fiber];
	while (stack.length > 0) {
		const current = stack.pop()!;
		if (visitor(current) === true) return;
		if (current.sibling) stack.push(current.sibling);
		if (current.child) stack.push(current.child);
	}
}

export function isInstrumentationActive(): boolean {
	try {
		if (inspectIsInstrumentationActive()) return true;
	} catch {
		/* ignore */
	}
	if (instrumentationFlag) return true;
	return typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && Boolean(__OCTANE_PROFILE_ENABLED__);
}

/** Enable/disable the binding-local instrumentation flag (tests / progressive wiring). */
export function __setInstrumentationActiveForTests(active: boolean): void {
	instrumentationFlag = active;
}

export interface InstrumentationOptions {
	name?: string;
	onCommitFiberRoot?: (rendererId: number, root: FiberRoot) => void;
	onCommitFiberUnmount?: (rendererId: number, fiber: Fiber) => void;
}

/**
 * No-op under Octane: commit instrumentation is owned by the runtime/devtools hook.
 * Kept so grab's three-selection / freeze call sites compile without React RDT.
 */
export function instrument(_options: InstrumentationOptions): void {
	// TODO(octane/inspect): register commit listeners when core exposes them.
}

export function getRDTHook(): { renderers: Map<number, ReactRenderer> } {
	return { renderers: new Map() };
}

export async function getOwnerStack(
	fiber: Fiber,
	_shouldCache?: boolean,
	_fetchFunction?: (url: string) => Promise<Response>,
): Promise<StackFrame[]> {
	const host = fiber.stateNode;
	if (host && typeof (host as Node).nodeType === 'number') {
		return getOwnerStackFromHost(host as Node).map(frameToStackFrame);
	}
	return inspectGetOwnerStack({
		handle: fiber.handle,
		displayName: String(fiber.type ?? ''),
		source: null,
	}).map(frameToStackFrame);
}

export async function getSource(
	fiber: Fiber,
	_cache?: boolean,
	_fetchFn?: (url: string) => Promise<Response>,
): Promise<{
	fileName: string;
	lineNumber?: number;
	columnNumber?: number;
	functionName?: string;
} | null> {
	const debug = fiber._debugSource;
	if (debug?.fileName) {
		return {
			fileName: debug.fileName,
			lineNumber: debug.lineNumber,
			columnNumber: debug.columnNumber,
			functionName: getDisplayName(fiber.type) ?? undefined,
		};
	}
	const frames = await getOwnerStack(fiber);
	const top = frames[0];
	if (!top?.fileName) return null;
	return {
		fileName: top.fileName,
		lineNumber: top.lineNumber,
		columnNumber: top.columnNumber,
		functionName: top.functionName,
	};
}

export function hasDebugStack(fiber: Fiber): fiber is Fiber & { _debugStack: Error } {
	return fiber._debugStack instanceof Error;
}

/**
 * Strip React/Next fake stack frames, keeping owner frames.
 * Clean-room: mirrors the documented bippy/React DevTools owner-stack filter shape.
 */
export function formatOwnerStack(stack: string): string {
	const lines = stack.split('\n');
	const kept: string[] = [];
	for (const line of lines) {
		if (/react-stack-(?:top|bottom)-frame/i.test(line)) continue;
		if (/fakeJSXCallSite/i.test(line)) continue;
		if (/^\s*Error:/.test(line)) continue;
		if (/at\s+\S+/.test(line)) kept.push(line);
	}
	return kept.join('\n');
}

const STACK_LINE =
	/^\s*at\s+(?:(?<functionName>.+?)\s+\()?(?<fileName>[^:\n]+):(?<lineNumber>\d+):(?<columnNumber>\d+)\)?/;

export function parseStack(
	stackString: string,
	options?: { slice?: number | [number, number]; allowEmpty?: boolean },
): StackFrame[] {
	const lines = stackString.split('\n');
	const frames: StackFrame[] = [];
	for (const line of lines) {
		const match = STACK_LINE.exec(line);
		if (!match?.groups) continue;
		frames.push({
			functionName: match.groups.functionName,
			fileName: match.groups.fileName,
			lineNumber: Number(match.groups.lineNumber),
			columnNumber: Number(match.groups.columnNumber),
			source: line.trim(),
		});
	}
	if (options?.slice != null) {
		if (typeof options.slice === 'number') return frames.slice(0, options.slice);
		const [start, end] = options.slice;
		return frames.slice(start, end);
	}
	if (frames.length === 0 && options?.allowEmpty) return [];
	return frames;
}

/** Strip webpack/vite query and scheme prefixes commonly seen in source maps. */
export function normalizeFileName(fileName: string): string {
	let normalized = fileName.replace(/\\/g, '/');
	normalized = normalized.replace(/^file:\/\//, '');
	normalized = normalized.replace(/^webpack:\/\//, '');
	normalized = normalized.replace(/^rsc:\/\/React\/(?:Server|Client)\//, '');
	const query = normalized.indexOf('?');
	if (query !== -1) normalized = normalized.slice(0, query);
	const hash = normalized.indexOf('#');
	if (hash !== -1) normalized = normalized.slice(0, hash);
	return normalized;
}

/** True when the path looks like an application/source module rather than a bundled chunk. */
export function isSourceFile(fileName: string): boolean {
	const normalized = normalizeFileName(fileName);
	if (!normalized) return false;
	if (/node_modules\//.test(normalized)) return false;
	if (/\.(?:m?[jt]sx?|vue|svelte|css|scss|sass|less)$/.test(normalized)) return true;
	if (/\/src\//.test(normalized) || normalized.startsWith('src/')) return true;
	return false;
}

/**
 * Binding-local freeze used by grab's freeze-updates module.
 * Full scheduler pause is `pauseUpdates` from `octane/inspect`.
 */
export function freezeOctaneUpdates(): () => void {
	try {
		const resume = pauseUpdates();
		resumeFreeze = resume;
		return () => {
			resume();
			if (resumeFreeze === resume) resumeFreeze = null;
		};
	} catch {
		// TODO(octane/inspect): pauseUpdates unavailable — binding-local no-op.
		return () => {};
	}
}
