export const FORM_FIELD_COUNT = 512;
export const STORE_SUBSCRIBER_COUNT = 512;
export const LIFECYCLE_ROW_COUNT = 96;
export const LIFECYCLE_CYCLES_PER_SAMPLE = 12;

export const FORM_FIELDS = Array.from({ length: FORM_FIELD_COUNT }, (_, index) => index);
export const STORE_SUBSCRIBERS = Array.from(
	{ length: STORE_SUBSCRIBER_COUNT },
	(_, index) => index,
);
export const LIFECYCLE_ROWS = Array.from({ length: LIFECYCLE_ROW_COUNT }, (_, index) => index);

function createStore(stats) {
	const values = Array.from({ length: STORE_SUBSCRIBER_COUNT }, () => 0);
	const listeners = new Set();

	function notify() {
		for (const listener of [...listeners]) {
			stats.notifications++;
			listener();
		}
	}

	return {
		get(index) {
			stats.snapshotCalls++;
			return values[index];
		},
		subscribe(listener) {
			stats.subscribeCalls++;
			listeners.add(listener);
			let active = true;
			return () => {
				if (active) {
					active = false;
					listeners.delete(listener);
					stats.unsubscribeCalls++;
				}
			};
		},
		writeOne(index, value) {
			values[index] = value;
			notify();
		},
		writeAll(value) {
			values.fill(value);
			notify();
		},
		get size() {
			return listeners.size;
		},
	};
}

export function installRuntimeStress() {
	const stats = {
		lifecycle: {
			mounts: 0,
			cleanups: 0,
			listenerAdds: 0,
			listenerRemoves: 0,
			subscriptionsCreated: 0,
			subscriptionsCleared: 0,
			timersCreated: 0,
			timersCleared: 0,
			probeEvents: 0,
		},
		form: {
			fieldRenders: Array.from({ length: FORM_FIELD_COUNT }, () => 0),
			validationRequests: 0,
			validationApplied: 0,
			validationStale: 0,
			validationGeneration: 0,
			lastValidated: '',
			submits: 0,
			lastSubmission: null,
		},
		store: {
			snapshotCalls: 0,
			subscribeCalls: 0,
			unsubscribeCalls: 0,
			notifications: 0,
			renders: Array.from({ length: STORE_SUBSCRIBER_COUNT }, () => 0),
		},
	};
	const state = {
		ready: false,
		stats,
		store: createStore(stats.store),
	};
	globalThis.__runtimeStress = state;
	return state;
}

export function getRuntimeStress() {
	const state = globalThis.__runtimeStress;
	if (!state) throw new Error('The runtime stress benchmark has not been initialized');
	return state;
}

export function mountLifecycleResource(index) {
	const stress = getRuntimeStress();
	const { lifecycle } = stress.stats;
	const onProbe = () => {
		lifecycle.probeEvents++;
	};
	const timer = setInterval(() => {}, 60_000);
	const unsubscribe = stress.store.subscribe(() => {});
	document.addEventListener('octane-runtime-stress-probe', onProbe);
	lifecycle.mounts++;
	lifecycle.listenerAdds++;
	lifecycle.subscriptionsCreated++;
	lifecycle.timersCreated++;
	let active = true;

	return () => {
		if (!active) return;
		active = false;
		clearInterval(timer);
		unsubscribe();
		document.removeEventListener('octane-runtime-stress-probe', onProbe);
		lifecycle.cleanups++;
		lifecycle.listenerRemoves++;
		lifecycle.subscriptionsCleared++;
		lifecycle.timersCleared++;
	};
}

export function markFieldRender(index) {
	getRuntimeStress().stats.form.fieldRenders[index]++;
}

export function markStoreRender(index) {
	getRuntimeStress().stats.store.renders[index]++;
}

export function recordValidation(value) {
	const form = getRuntimeStress().stats.form;
	const generation = ++form.validationGeneration;
	form.validationRequests++;
	setTimeout(() => {
		if (generation !== form.validationGeneration) {
			form.validationStale++;
			return;
		}
		form.validationApplied++;
		form.lastValidated = value;
	}, 40);
}

export function recordSubmission(event) {
	event.preventDefault();
	const form = getRuntimeStress().stats.form;
	form.submits++;
	form.lastSubmission = Object.fromEntries(new FormData(event.currentTarget));
}
