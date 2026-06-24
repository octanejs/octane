/**
 * Keyed-reconciliation identity harness.
 *
 * Ports the *renderer-agnostic* half of React's child-reconciliation contract
 * (`ReactMultiChildReconcile-test.js`): across a reorder/insert/remove, which
 * keyed children keep their DOM node (preserved) vs get a fresh one (remounted),
 * and what the final order is.
 *
 * It deliberately does NOT assert the physical *move sequence* (which DOM nodes
 * were detached / re-inserted). Octane keeps its LIS reconciler, which minimizes
 * moves; React's `lastPlacedIndex` pass moves a different set of nodes to reach
 * the same final order. That divergence is intentional and documented
 * (docs/react-parity-migration-plan.md §6.1). What IS shared — and what this
 * harness pins — is survivor identity preservation + final order: a keyed child
 * that lives across a reorder is never spuriously remounted, and a key absent
 * for a commit then re-added gets a NEW node.
 *
 * Fixtures tag each keyed child with `data-k="<key>"`; the harness maps node
 * identity by that attribute.
 */

export interface KeyedSnapshot {
	/** key -> the DOM element currently carrying that key */
	byKey: Map<string, Element>;
	/** keys in document order */
	order: string[];
}

export interface IdentityDiff {
	/** keys present before AND after whose DOM node is the SAME instance */
	preserved: string[];
	/** keys present before AND after but whose DOM node is a DIFFERENT instance */
	remounted: string[];
	/** keys present only after */
	added: string[];
	/** keys present only before */
	removed: string[];
}

/** Snapshot the keyed children under `container` (default selector `[data-k]`). */
export function snapshotKeyed(container: Element, selector = '[data-k]'): KeyedSnapshot {
	const byKey = new Map<string, Element>();
	const order: string[] = [];
	for (const el of Array.from(container.querySelectorAll(selector))) {
		const k = el.getAttribute('data-k');
		if (k == null) continue;
		if (byKey.has(k)) throw new Error(`duplicate data-k="${k}" in snapshot`);
		byKey.set(k, el);
		order.push(k);
	}
	return { byKey, order };
}

/** Classify how every key changed between two snapshots by DOM-node identity. */
export function diffIdentity(before: KeyedSnapshot, after: KeyedSnapshot): IdentityDiff {
	const preserved: string[] = [];
	const remounted: string[] = [];
	const added: string[] = [];
	const removed: string[] = [];
	for (const [k, node] of after.byKey) {
		const prev = before.byKey.get(k);
		if (prev === undefined) added.push(k);
		else if (prev === node) preserved.push(k);
		else remounted.push(k);
	}
	for (const k of before.byKey.keys()) {
		if (!after.byKey.has(k)) removed.push(k);
	}
	return { preserved, remounted, added, removed };
}

/**
 * Assert the shared identity contract in one call: final `order` matches, and
 * every still-present key kept its node (no spurious remounts). Pass
 * `expectRemounted` for cases where a remount IS the contract (e.g. a key that
 * was removed and re-added in an earlier step).
 */
export function expectIdentity(
	expect: (actual: unknown) => { toEqual(v: unknown): void },
	before: KeyedSnapshot,
	after: KeyedSnapshot,
	expected: { order: string[]; remounted?: string[] },
): void {
	const d = diffIdentity(before, after);
	expect(after.order).toEqual(expected.order);
	expect(d.remounted.slice().sort()).toEqual((expected.remounted ?? []).slice().sort());
}
