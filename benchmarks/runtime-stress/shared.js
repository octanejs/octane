export const FORM_FIELD_COUNT = 512;
export const STORE_SUBSCRIBER_COUNT = 512;
export const LIFECYCLE_ROW_COUNT = 96;
export const LIFECYCLE_CYCLES_PER_SAMPLE = 12;
export const EVENT_DISPATCH_COUNT = 128;
export const SCALE_LEVELS = [8, 32, 96, 256, 512];

export const FORM_FIELDS = Array.from({ length: FORM_FIELD_COUNT }, (_, index) => index);
export const STORE_SUBSCRIBERS = Array.from(
	{ length: STORE_SUBSCRIBER_COUNT },
	(_, index) => index,
);
export const LIFECYCLE_ROWS = Array.from({ length: LIFECYCLE_ROW_COUNT }, (_, index) => index);

function createStore(stats) {
	const values = Array.from({ length: STORE_SUBSCRIBER_COUNT }, () => 0);
	const listeners = new Set();
	let backend;
	let releaseBackend;

	function notify() {
		for (const listener of [...listeners]) {
			stats.notifications++;
			listener();
		}
	}

	return {
		get(index) {
			stats.snapshotCalls++;
			return backend ? backend.getValues()[index] : values[index];
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
			if (backend) {
				backend.writeOne(index, value);
				return;
			}
			values[index] = value;
			notify();
		},
		writeAll(value) {
			if (backend) {
				backend.writeAll(value);
				return;
			}
			values.fill(value);
			notify();
		},
		setBackend(next) {
			if (listeners.size !== 0) {
				throw new Error('Store integrations cannot change while subscribers remain mounted');
			}
			releaseBackend?.();
			backend = next;
			stats.backend = next.name;
			releaseBackend = next.subscribe(() => {
				stats.backendNotifications++;
				notify();
			});
		},
		async invalidate() {
			return backend?.invalidate?.();
		},
		get size() {
			return listeners.size;
		},
	};
}

async function createStoreBackend(name) {
	const initial = () => Array.from({ length: STORE_SUBSCRIBER_COUNT }, () => 0);
	if (name === 'zustand') {
		const { createStore } = await import('../../packages/zustand/src/vanilla.ts');
		const store = createStore(() => ({ values: initial() }));
		return {
			name,
			getValues: () => store.getState().values,
			subscribe: (listener) => store.subscribe(listener),
			writeOne(index, value) {
				store.setState(({ values }) => ({ values: values.with(index, value) }));
			},
			writeAll(value) {
				store.setState({ values: Array.from({ length: STORE_SUBSCRIBER_COUNT }, () => value) });
			},
		};
	}
	if (name === 'jotai') {
		const { atom, createStore } = await import('../../packages/jotai/src/vanilla.ts');
		const valuesAtom = atom(initial());
		const store = createStore();
		return {
			name,
			getValues: () => store.get(valuesAtom),
			subscribe: (listener) => store.sub(valuesAtom, listener),
			writeOne(index, value) {
				store.set(valuesAtom, (values) => values.with(index, value));
			},
			writeAll(value) {
				store.set(
					valuesAtom,
					Array.from({ length: STORE_SUBSCRIBER_COUNT }, () => value),
				);
			},
		};
	}
	if (name === 'tanstack-query') {
		const { QueryClient } = await import('../../packages/tanstack-query/src/benchmark-core.ts');
		const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
		const queryKey = ['runtime-stress', 'subscribers'];
		let refetches = 0;
		client.setQueryDefaults(queryKey, {
			queryFn: async () => {
				const values = client.getQueryData(queryKey);
				if (!values) throw new Error('The benchmark query lost its cached subscriber state');
				refetches++;
				return values.with(17, values[17] + 1);
			},
		});
		client.setQueryData(queryKey, initial());
		return {
			name,
			getValues: () => client.getQueryData(queryKey),
			subscribe: (listener) =>
				client.getQueryCache().subscribe((event) => {
					if (event.type === 'updated') listener();
				}),
			writeOne(index, value) {
				client.setQueryData(queryKey, (values) => values.with(index, value));
			},
			writeAll(value) {
				client.setQueryData(
					queryKey,
					Array.from({ length: STORE_SUBSCRIBER_COUNT }, () => value),
				);
			},
			async invalidate() {
				await client.invalidateQueries({ queryKey, exact: true, refetchType: 'all' });
				return { refetches, value: client.getQueryData(queryKey)?.[17] };
			},
		};
	}
	throw new Error(`Unknown external-store integration: ${name}`);
}

function createAsyncResource(stats) {
	const listeners = new Set();
	let generation = 0;
	let snapshot = { error: '', generation, status: 'idle', value: '' };
	let timer;

	function publish(next) {
		snapshot = next;
		for (const listener of [...listeners]) listener();
	}

	return {
		getSnapshot() {
			return snapshot;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		run(outcome, value = 'recovered') {
			const current = ++generation;
			if (timer !== undefined) {
				clearTimeout(timer);
				stats.cancelled++;
			}
			stats.requests++;
			publish({ error: '', generation: current, status: 'pending', value: '' });
			timer = setTimeout(
				() => {
					timer = undefined;
					if (current !== generation) {
						stats.staleCompletions++;
						return;
					}
					if (outcome === 'reject') {
						stats.rejections++;
						publish({
							error: 'Benchmark request rejected',
							generation: current,
							status: 'error',
							value: '',
						});
						return;
					}
					stats.resolutions++;
					publish({ error: '', generation: current, status: 'resolved', value });
				},
				outcome === 'slow' ? 60 : 12,
			);
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
			backend: 'native',
			backendNotifications: 0,
			snapshotCalls: 0,
			subscribeCalls: 0,
			unsubscribeCalls: 0,
			notifications: 0,
			renders: Array.from({ length: STORE_SUBSCRIBER_COUNT }, () => 0),
		},
		async: {
			cancelled: 0,
			requests: 0,
			rejections: 0,
			resolutions: 0,
			staleCompletions: 0,
		},
	};
	const state = {
		ready: false,
		stats,
		async: createAsyncResource(stats.async),
		store: createStore(stats.store),
	};
	state.activateIntegration = async (name) => {
		state.store.setBackend(await createStoreBackend(name));
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
