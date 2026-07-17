/**
 * The ONE module in the React-hosted Phase 0 spike allowed to touch React
 * Fiber internals (docs/react-hosted-octane-compat-plan.md §6.1, §12):
 *
 *  - discover the `__reactFiber$<suffix>` stamp ReactDOM 19 places on host
 *    nodes (the only host→Fiber channel left in 19.2 — the DevTools
 *    `findFiberByHostInstance` payload entry was removed);
 *  - resolve the committed Fiber when the stamp is the stale alternate, via
 *    the HostRoot's `current` pointer (React's current-Fiber slow path,
 *    reduced to the committed-idle-tree case the adapter runs in);
 *  - walk `return` for the nearest provider of a given React context and read
 *    its committed `memoizedProps.value`.
 *
 * Fiber access is bootstrap-only: it never subscribes. The wrapper's
 * `React.use(context)` calls remain the propagation mechanism. Everything here
 * is audited against React 19.2.x; the production adapter must sit behind
 * feature detection and fall back to the public `HostContextRequest` handshake.
 */

// ReactWorkTags.HostRoot — stable numeric tag since React 16.3.
const HOST_ROOT_TAG = 3;

// The stamp suffix is randomized per ReactDOM module instance. Cache the first
// discovered key; a real multi-renderer page would cache per suffix (§10).
let fiberKey: string | null = null;

export function findStampedFiber(node: Element): any | null {
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

function topOfTree(fiber: any): any {
	let node = fiber;
	while (node.return !== null && node.return !== undefined) node = node.return;
	return node;
}

function onCurrentTree(fiber: any): boolean {
	const top = topOfTree(fiber);
	return top.tag === HOST_ROOT_TAG && top.stateNode != null && top.stateNode.current === top;
}

export interface ResolvedFiber {
	fiber: any;
	/** True when the DOM stamp pointed at the non-current alternate (§6.1 trap 1). */
	stampWasStale: boolean;
}

/**
 * Resolve the committed (current-tree) Fiber for a stamped host Fiber. Between
 * commits — the only time the adapter runs — a Fiber is on the current tree
 * exactly when its root-ward `return` walk ends at the HostRoot Fiber that the
 * FiberRoot's `current` field points to; otherwise its alternate is.
 */
export function resolveCurrentFiber(stamped: any): ResolvedFiber | null {
	if (stamped == null) return null;
	if (onCurrentTree(stamped)) return { fiber: stamped, stampWasStale: false };
	const alternate = stamped.alternate;
	if (alternate != null && onCurrentTree(alternate)) {
		return { fiber: alternate, stampWasStale: true };
	}
	return null;
}

export interface ProviderReadResult {
	/** False when no provider for the context exists above the host (or the adapter failed). */
	found: boolean;
	/** The committed provider value — may legitimately be `undefined` with `found` true. */
	value: unknown;
	stampWasStale: boolean;
}

const NOT_FOUND: ProviderReadResult = { found: false, value: undefined, stampWasStale: false };

/**
 * One-time bootstrap read (§6.2 steps 4–5): nearest committed provider value
 * for `reactContext` above the host element. Returns `found: false` when no
 * provider exists — the caller must NOT fall back to `context._currentValue`
 * (renderer-global, no nearest-provider semantics); the public fallback is the
 * `HostContextRequest` retry handshake.
 */
export function readNearestProviderValue(host: Element, reactContext: unknown): ProviderReadResult {
	const stamped = findStampedFiber(host);
	if (stamped === null) return NOT_FOUND;
	const resolved = resolveCurrentFiber(stamped);
	if (resolved === null) return NOT_FOUND;
	const provider = (reactContext as { Provider?: unknown } | null)?.Provider;
	for (let fiber = resolved.fiber; fiber != null; fiber = fiber.return) {
		const type = fiber.type;
		// React 19 renders `<Ctx value>` with the context object itself as the
		// provider fiber type; `Ctx.Provider` is an identity alias in 19 but is
		// matched separately in case a future minor splits them again.
		if (type === reactContext || (provider !== undefined && type === provider)) {
			return {
				found: true,
				value: fiber.memoizedProps?.value,
				stampWasStale: resolved.stampWasStale,
			};
		}
	}
	return { found: false, value: undefined, stampWasStale: resolved.stampWasStale };
}
