/**
 * The ONE module in `octane/react` that touches React Fiber internals
 * (docs/react-hosted-octane-compat-plan.md §6.1, §12):
 *
 *  - discover the `__reactFiber$<suffix>` stamp ReactDOM 19 places on host
 *    nodes (the only host→Fiber channel in 19.2 — the DevTools
 *    `findFiberByHostInstance` injection entry was removed);
 *  - resolve the committed Fiber when the stamp is the stale alternate, via
 *    the HostRoot's `current` pointer;
 *  - walk `return` for the nearest provider of a given React context and read
 *    its committed `memoizedProps.value`.
 *
 * Fiber access is BOOTSTRAP-ONLY and fidelity-only: it never subscribes (the
 * wrapper's `React.use(context)` reads are the propagation mechanism), and
 * every failure — unknown stamp, unresolvable current tree, missing provider,
 * or a future Fiber shape change — degrades to `found: false`, which the
 * controller answers with the public `HostContextRequest` retry handshake
 * (§6.3). No `context._currentValue` fallback, ever: it is renderer-global
 * and has no nearest-provider semantics.
 */

// ReactWorkTags.HostRoot — stable numeric tag since React 16.3.
const HOST_ROOT_TAG = 3;

// The stamp suffix is randomized per ReactDOM module instance. Cache the first
// discovered key; a multi-renderer page re-scans when the cached key misses
// (§10 — per-suffix caching can replace this if multi-copy pages show cost).
let fiberKey: string | null = null;

// Structural instrumentation for the benchmark/ratio harness (§13): provider
// walks must happen only at first discovery, never after subscription.
let providerWalks = 0;

/** @internal Structural counter for the bench harness and tests. */
export function __hostContextFiberWalks(): number {
	return providerWalks;
}

// Test hook: force the adapter unavailable so the HostContextRequest fallback
// path is exercisable without corrupting real Fibers.
let adapterEnabled = true;

/** @internal Test-only override — never used by production code paths. */
export function __setHostFiberAdapterEnabled(enabled: boolean): void {
	adapterEnabled = enabled;
}

function findStampedFiber(node: Element): any | null {
	const record = node as unknown as Record<string, unknown>;
	if (fiberKey !== null && record[fiberKey] !== undefined) return record[fiberKey];
	for (const key of Object.keys(record)) {
		if (key.startsWith('__reactFiber$')) {
			fiberKey = key;
			return record[key];
		}
	}
	return null;
}

function onCurrentTree(fiber: any): boolean {
	let top = fiber;
	while (top.return !== null && top.return !== undefined) top = top.return;
	return top.tag === HOST_ROOT_TAG && top.stateNode != null && top.stateNode.current === top;
}

/**
 * Between commits — the only time the adapter runs — a Fiber is on the
 * current tree exactly when its root-ward `return` walk ends at the HostRoot
 * Fiber that the FiberRoot's `current` field points to; otherwise its
 * alternate is (§6.1 trap 1: the DOM stamp can be the stale alternate).
 */
function resolveCurrentFiber(stamped: any): any | null {
	if (stamped == null) return null;
	if (onCurrentTree(stamped)) return stamped;
	const alternate = stamped.alternate;
	if (alternate != null && onCurrentTree(alternate)) return alternate;
	return null;
}

export interface ProviderReadResult {
	/** False when no provider exists above the host OR the adapter failed. */
	found: boolean;
	/** The committed provider value — may legitimately be `undefined` with `found` true. */
	value: unknown;
}

const NOT_FOUND: ProviderReadResult = { found: false, value: undefined };

/**
 * One-time bootstrap read (§6.2 steps 4–5): the nearest committed provider
 * value for `reactContext` above `host`. Every internal failure degrades to
 * `found: false` — reduced fidelity (one handshake retry), never
 * incorrectness.
 */
export function readNearestProviderValue(host: Element, reactContext: object): ProviderReadResult {
	if (!adapterEnabled) return NOT_FOUND;
	providerWalks++;
	try {
		const current = resolveCurrentFiber(findStampedFiber(host));
		if (current === null) return NOT_FOUND;
		const provider = (reactContext as { Provider?: unknown }).Provider;
		for (let fiber = current; fiber != null; fiber = fiber.return) {
			const type = fiber.type;
			// React 19 renders `<Ctx value>` with the context object itself as the
			// provider fiber type; `Ctx.Provider` is an identity alias in 19 but is
			// matched separately in case a future minor splits them again.
			if (type === reactContext || (provider !== undefined && type === provider)) {
				return { found: true, value: fiber.memoizedProps?.value };
			}
		}
		return NOT_FOUND;
	} catch {
		// An unexpected Fiber shape must never break a hosted read — fall back
		// to the public handshake.
		return NOT_FOUND;
	}
}
