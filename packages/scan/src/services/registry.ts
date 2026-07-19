// ComponentRegistry — the authority on "which component is this, and where is
// it in the tree/DOM". One responsibility: maintain a live index of component
// instances and answer spatial/structural queries against it. It is fed two
// ways — live from the pipeline, and lazily backfilled from the source's event
// buffer — so an instance that mounted before scanning was enabled (a hydrated
// page's initial render) is still resolvable. The selection service and the
// interaction profiler depend on it; it depends only on the contract + source.
import type { ComponentIdentity, InspectionEvent, InspectionSource } from '../contract.js';
import type { Pipeline } from '../pipeline.js';

export interface ComponentInstance {
	readonly instanceId: number;
	readonly component: ComponentIdentity;
	/** Current top-level DOM elements of this instance (lazy). */
	domNodes(): Element[];
	/** Union bounding rect of `domNodes()`, or null if unmounted/detached. */
	rect(): DOMRect | null;
}

export interface ComponentRegistry {
	/** Innermost instance whose DOM contains `element`, or null. */
	resolveByDom(element: Element): ComponentInstance | null;
	/** Look up a known instance by id. */
	get(instanceId: number): ComponentInstance | null;
	/** Owner instance, when the source exposes hierarchy; else null. */
	parentOf(instance: ComponentInstance): ComponentInstance | null;
	clear(): void;
}

const MAX_TRACKED = 4000;

function depthOf(element: Element): number {
	let depth = 0;
	for (let node: Node | null = element; node !== null; node = node.parentNode) depth++;
	return depth;
}

function unionRect(elements: Element[]): DOMRect | null {
	let left = Infinity;
	let top = Infinity;
	let right = -Infinity;
	let bottom = -Infinity;
	for (const element of elements) {
		const rect = element.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) continue;
		left = Math.min(left, rect.left);
		top = Math.min(top, rect.top);
		right = Math.max(right, rect.right);
		bottom = Math.max(bottom, rect.bottom);
	}
	if (right < left || bottom < top) return null;
	return new DOMRect(left, top, right - left, bottom - top);
}

export function createRegistry(
	pipeline: Pipeline,
	source: InspectionSource,
): ComponentRegistry & { detach(): void } {
	const instances = new Map<number, ComponentInstance>();
	let seeded = false;

	function toInstance(event: InspectionEvent): ComponentInstance {
		const instanceId = event.instanceId;
		return {
			instanceId,
			component: event.component,
			domNodes: () => source.domNodes(instanceId),
			rect: () => unionRect(source.domNodes(instanceId)),
		};
	}

	function ingest(event: InspectionEvent): void {
		instances.delete(event.instanceId);
		instances.set(event.instanceId, toInstance(event));
		if (instances.size > MAX_TRACKED) {
			const excess = instances.size - MAX_TRACKED;
			let index = 0;
			for (const key of instances.keys()) {
				if (index++ >= excess) break;
				instances.delete(key);
			}
		}
	}

	/** One-time backfill of instances that mounted before the pipeline listened. */
	function seed(): void {
		if (seeded) return;
		seeded = true;
		try {
			for (const event of source.bufferedEvents()) ingest(event);
		} catch {
			// Backfill is best-effort; never break resolution over it.
		}
	}

	const detach = pipeline.onEvent(ingest);

	return {
		resolveByDom(element) {
			seed();
			let best: ComponentInstance | null = null;
			let bestDepth = -1;
			for (const instance of instances.values()) {
				for (const node of instance.domNodes()) {
					if (node !== element && !node.contains(element)) continue;
					const depth = depthOf(node);
					if (depth > bestDepth) {
						bestDepth = depth;
						best = instance;
					}
				}
			}
			return best;
		},
		get(instanceId) {
			seed();
			return instances.get(instanceId) ?? null;
		},
		parentOf(instance) {
			if (source.parentInstance === undefined) return null;
			const parentId = source.parentInstance(instance.instanceId);
			return parentId === null ? null : (instances.get(parentId) ?? null);
		},
		clear() {
			instances.clear();
			seeded = false;
		},
		detach,
	};
}
