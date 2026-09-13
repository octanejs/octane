/**
 * Opt-in DOM → owner inspection and update-freeze for tools like `@octanejs/grab`.
 *
 * Hot-path note: `pauseUpdates` only adds a boolean check on the scheduler
 * schedule path. Host→owner walks run only when a tool asks, never per render.
 *
 * Metadata (component names / source frames) is richest when the app is built
 * with `devtools: true` / profiling. Without that, freeze still works and host
 * ownership falls back to marker-range containment when roots are registered.
 */

export interface InspectSourceFrame {
	name: string;
	fileName: string | null;
	lineNumber: number | null;
	columnNumber: number | null;
}

export interface InspectOwner {
	/** Opaque runtime block; identity is stable for the mounted instance. */
	readonly handle: object;
	displayName: string;
	source: InspectSourceFrame | null;
}

interface InspectBlockLike {
	body?: unknown;
	parentBlock: InspectBlockLike | null;
	parentNode?: Node | null;
	startMarker: Node | null;
	endMarker: Node | null;
	disposed?: boolean;
	children?: Array<{ key: unknown; scope: InspectBlockLike }> | null;
	kind?: string;
}

const inspectRoots = new Set<InspectBlockLike>();
let nameResolver: (block: InspectBlockLike) => string = (block) => {
	const body = block.body;
	if (typeof body === 'function') {
		const named = (body as { displayName?: string; name?: string }).displayName || body.name;
		if (named) return named;
	}
	return 'Unknown';
};
let childWalker:
	((scope: InspectBlockLike, visit: (child: InspectBlockLike) => void) => void) | null = null;

/** @internal Wired from runtime.ts beside the DevTools root hooks. */
export function __inspectRegisterRoot(block: InspectBlockLike): void {
	inspectRoots.add(block);
}

/** @internal */
export function __inspectUnregisterRoot(block: InspectBlockLike): void {
	inspectRoots.delete(block);
}

/** @internal */
export function __inspectSetNameResolver(resolver: (block: any) => string): void {
	nameResolver = resolver;
}

/** @internal */
export function __inspectSetChildWalker(
	walker: (scope: any, visit: (child: any) => void) => void,
): void {
	childWalker = walker;
}

function parseSourceLoc(loc: string | undefined): Omit<InspectSourceFrame, 'name'> | null {
	if (!loc) return null;
	const match = /^(.*):(\d+):(\d+)$/.exec(loc);
	if (!match) return { fileName: loc, lineNumber: null, columnNumber: null };
	return {
		fileName: match[1] || null,
		lineNumber: Number(match[2]),
		columnNumber: Number(match[3]),
	};
}

function componentSource(block: InspectBlockLike): InspectSourceFrame | null {
	const body = block.body;
	let loc: string | undefined;
	if (typeof body === 'function') {
		try {
			const stamped = (body as { __oct_loc?: string }).__oct_loc;
			if (typeof stamped === 'string') loc = stamped;
		} catch {
			/* ignore */
		}
		if (!loc) {
			try {
				const source = Function.prototype.toString.call(body);
				const match = /["']__octane_loc:([^"'\\\s]+)["']/.exec(source);
				if (match !== null) loc = decodeURIComponent(match[1]);
			} catch {
				/* ignore */
			}
		}
	}
	const parsed = parseSourceLoc(loc);
	if (!parsed) return null;
	return { name: nameResolver(block), ...parsed };
}

function nodeInBlockRange(block: InspectBlockLike, node: Node): boolean {
	const start = block.startMarker;
	const end = block.endMarker;
	// Exclusive markers are null on createRoot-style roots; some scopes leave them
	// undefined instead — treat both as "no exclusive range".
	if (start == null || end == null) {
		// createRoot roots often keep null exclusive markers and own `parentNode`.
		const parent = (block as InspectBlockLike & { parentNode?: Node | null }).parentNode ?? null;
		if (parent === null) return false;
		return parent === node || (typeof parent.contains === 'function' && parent.contains(node));
	}
	if (node === start || node === end) return true;
	// Client single-root mounts self-delimit: startMarker === endMarker === the
	// sole host element (no exclusive comment pair). Exclusive FOLLOWING/PRECEDING
	// checks fail for descendants (CONTAINED_BY, not PRECEDING), so treat that
	// element as an inclusive container.
	if (start === end) {
		return typeof (start as Node & { contains?: (n: Node) => boolean }).contains === 'function'
			? (start as Node & { contains: (n: Node) => boolean }).contains(node)
			: false;
	}
	const afterStart = start.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING;
	const beforeEnd = end.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING;
	return afterStart !== 0 && beforeEnd !== 0;
}

function visitChildren(block: InspectBlockLike, visit: (child: InspectBlockLike) => void): void {
	if (childWalker) {
		childWalker(block, visit);
		return;
	}
	const children = block.children;
	if (!children) return;
	for (let i = 0; i < children.length; i++) visit(children[i].scope);
}

function deepestOwner(block: InspectBlockLike, node: Node): InspectBlockLike | null {
	if (block.disposed || !nodeInBlockRange(block, node)) return null;
	let best: InspectBlockLike = block;
	visitChildren(block, (child) => {
		const nested = deepestOwner(child, node);
		if (nested !== null) best = nested;
	});
	return best;
}

function toOwner(block: InspectBlockLike): InspectOwner {
	return {
		handle: block,
		displayName: nameResolver(block),
		source: componentSource(block),
	};
}

/**
 * Map a DOM node to the deepest mounted Octane owner whose marker range
 * contains it. Returns null when no registered root covers the node.
 */
export function getOwnerFromHostInstance(node: Node | null | undefined): InspectOwner | null {
	if (node == null || inspectRoots.size === 0) return null;
	let best: InspectBlockLike | null = null;
	for (const root of inspectRoots) {
		const owner = deepestOwner(root, node);
		if (owner !== null) best = owner;
	}
	return best ? toOwner(best) : null;
}

/** Owner stack from the host node outward (leaf first), matching grab copy order. */
export function getOwnerStackFromHost(node: Node | null | undefined): InspectSourceFrame[] {
	const owner = getOwnerFromHostInstance(node);
	if (!owner) return [];
	return getOwnerStack(owner);
}

/** Walk `parentBlock` from an owner toward the root. */
export function getOwnerStack(owner: InspectOwner | object): InspectSourceFrame[] {
	const handle =
		owner && typeof owner === 'object' && 'handle' in owner
			? ((owner as InspectOwner).handle as InspectBlockLike)
			: (owner as InspectBlockLike);
	const frames: InspectSourceFrame[] = [];
	for (
		let current: InspectBlockLike | null = handle;
		current !== null;
		current = current.parentBlock
	) {
		const source = componentSource(current);
		frames.push(
			source ?? {
				name: nameResolver(current),
				fileName: null,
				lineNumber: null,
				columnNumber: null,
			},
		);
	}
	return frames;
}

/** True when at least one Octane root is registered for inspection. */
export function isInstrumentationActive(): boolean {
	return inspectRoots.size > 0;
}

/**
 * True when `block` lives under a root registered with `createRoot` (default
 * `inspect: true`). Roots created with `inspect: false` are invisible to
 * instrumentation and are NOT pause targets — tool overlays (e.g. grab) must
 * keep scheduling while `pauseUpdates()` freezes the application tree.
 *
 * Hot path: called only while updates are paused (cold). Walk is O(depth).
 */
export function isUnderInstrumentedInspectRoot(
	block: {
		parentBlock: object | null;
	} | null,
): boolean {
	for (let current = block; current !== null; current = current.parentBlock as typeof current) {
		if (inspectRoots.has(current as InspectBlockLike)) return true;
	}
	return false;
}

// Pause flag lives here; runtime.ts reads it through `isInspectUpdatesPaused()`
// so the schedule hot path stays one function call without relying on live
// ESM bindings through the Vitest/transform pipeline.
let inspectUpdatesPaused = false;

/**
 * Freeze scheduled updates for instrumented application roots until the
 * returned resume runs. Roots created with `{ inspect: false }` keep flushing
 * (mount effects, props updates) so tool overlays remain live while the app is
 * frozen.
 */
export function pauseUpdates(): () => void {
	if (inspectUpdatesPaused) {
		return () => {};
	}
	inspectUpdatesPaused = true;
	return () => {
		inspectUpdatesPaused = false;
		resumeInspectFlush?.();
	};
}

export function isInspectUpdatesPaused(): boolean {
	return inspectUpdatesPaused;
}

/** @internal Set by runtime so resume can request a flush without a cycle. */
export let resumeInspectFlush: (() => void) | null = null;

export function __inspectSetResumeFlush(fn: () => void): void {
	resumeInspectFlush = fn;
}
