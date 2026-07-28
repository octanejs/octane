// Shared fixture state for the selector-based external-store fan-out suite.
//
// The workload this suite exists to observe is an UNRELATED PARENT RE-RENDER
// while the store is untouched. Every subscriber reads the same store through a
// selector, so a parent render that changes nothing the store owns must not
// re-run the selection 512 times. `selectorCalls` is the deterministic signal:
// it is attributable entirely to selector identity, with no timing noise in it.
//
// The store publishes an immutable snapshot whose identity changes only on a
// write, which is what lets a selector layer cache a selection across renders.

export const SELECTOR_SUBSCRIBER_COUNT = 512;
export const SELECTOR_INPUT_SIZE = 2000;
export const PARENT_RERENDER_COUNT = 20;

export const SELECTOR_SUBSCRIBERS = Array.from(
	{ length: SELECTOR_SUBSCRIBER_COUNT },
	(_, index) => index,
);

function createSnapshot(version, value) {
	return {
		values: Array.from({ length: SELECTOR_INPUT_SIZE }, () => value),
		version,
	};
}

function createStore(stats) {
	const listeners = new Set();
	let snapshot = createSnapshot(0, 0);

	return {
		getSnapshot() {
			stats.snapshotCalls++;
			return snapshot;
		},
		subscribe(listener) {
			stats.subscribeCalls++;
			listeners.add(listener);
			let active = true;
			return () => {
				if (!active) return;
				active = false;
				listeners.delete(listener);
				stats.unsubscribeCalls++;
			};
		},
		writeAll(value) {
			snapshot = createSnapshot(snapshot.version + 1, value);
			for (const listener of [...listeners]) {
				stats.notifications++;
				listener();
			}
		},
		get size() {
			return listeners.size;
		},
	};
}

export function installStoreSelectorStress() {
	const stats = {
		notifications: 0,
		selectorCalls: 0,
		snapshotCalls: 0,
		subscribeCalls: 0,
		subscriberRenders: 0,
		unsubscribeCalls: 0,
	};
	const state = {
		// Per-target synchronous flush, installed by each fixture entry so the
		// harness can drive N discrete parent renders without a Playwright round
		// trip or a timer floor per render.
		flush: (run) => run(),
		ready: false,
		stats,
		store: createStore(stats),
	};
	globalThis.__storeSelectorStress = state;
	return state;
}

export function getStoreSelectorStress() {
	const state = globalThis.__storeSelectorStress;
	if (!state) throw new Error('The store selector benchmark has not been initialized');
	return state;
}

/**
 * The expensive half of the selection. Every framework's selector calls this
 * with the same array, so the work per invocation is identical across targets
 * and the invocation COUNT is the only thing a selector layer can change.
 */
export function selectTotal(values) {
	const stats = getStoreSelectorStress().stats;
	stats.selectorCalls++;
	let total = 0;
	for (let index = 0; index < values.length; index++) total += values[index];
	return total;
}

export function markSubscriberRender() {
	getStoreSelectorStress().stats.subscriberRenders++;
}
