// Public native-object renderer control for external-store subscription lifetime
// and queued invalidation work. No compiler or host-device timing is involved.
process.env.NODE_ENV = 'production';

import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const rawIterations = process.argv[2] ?? '5';
const iterations = Number(rawIterations);
if (!Number.isSafeInteger(iterations) || iterations <= 0) {
	throw new TypeError(`iterations must be a positive safe integer, received ${rawIterations}.`);
}

const SUBSCRIBERS = 128;
const WARMUP_ROUNDS = 5;
const OPERATIONS_PER_SAMPLE = 20;
const BURST_WARMUPS = 2;
const BURST_SIZES = [2_000, 8_000];
const REPLACEMENTS = 2_000;
const stat = (samples) => timingStatForJson(summarizeSamples(samples));
const count = (value) => stat([value]);
const ensure = (condition, message) => {
	if (!condition) throw new Error(message);
};

function createStore() {
	let value = 0;
	const listeners = new Set();
	const counters = { snapshotCalls: 0, subscribeCalls: 0, unsubscribeCalls: 0, notifications: 0 };
	const notify = () => {
		for (const listener of [...listeners]) {
			counters.notifications++;
			listener();
		}
	};
	return {
		get value() {
			return value;
		},
		getSnapshot() {
			counters.snapshotCalls++;
			return value;
		},
		subscribe(listener) {
			counters.subscribeCalls++;
			listeners.add(listener);
			return () => {
				counters.unsubscribeCalls++;
				listeners.delete(listener);
			};
		},
		write(next) {
			value = next;
			notify();
		},
		notify,
		listeners,
		counters,
	};
}

function createValuePlan(runtime) {
	return runtime.universalPlan('object', {
		kind: 'host',
		type: 'store-value',
		bindings: [
			['value', 0],
			['generation', 1],
			['index', 2],
		],
	});
}

function runLifecycle(runtime, name) {
	const store = createStore();
	const plan = createValuePlan(runtime);
	const Reader = runtime.defineUniversalComponent('object', (props) => {
		const subscribe =
			name === 'changing-subscribe' ? (listener) => store.subscribe(listener) : store.subscribe;
		const getSnapshot = name === 'inline-getter' ? () => store.getSnapshot() : store.getSnapshot;
		const value = runtime.useSyncExternalStore(subscribe, getSnapshot, undefined, 'store');
		return runtime.universalValue(plan, [value + props.index, props.generation, props.index]);
	});
	const Scene = runtime.defineUniversalComponent('object', ({ generation }) =>
		Array.from({ length: SUBSCRIBERS }, (_, index) =>
			runtime.universalComponent('object', Reader, { index, generation }, index),
		),
	);
	const container = runtime.createObjectContainer();
	const root = runtime.createUniversalRoot(container, runtime.createObjectDriver());
	let generation = 0;
	let storeUpdates = 0;
	const samples = { parent_rerenders: [], store_updates: [] };
	try {
		root.render(Scene, { generation });
		const hosts = [...container.children];
		const verify = () => {
			ensure(container.children.length === SUBSCRIBERS, `${name}: wrong host count`);
			ensure(store.listeners.size === SUBSCRIBERS, `${name}: disconnected live readers`);
			for (let index = 0; index < SUBSCRIBERS; index++) {
				const host = container.children[index];
				ensure(host === hosts[index], `${name}: reader ${index} lost host identity`);
				ensure(
					host.props.value === store.value + index &&
						host.props.generation === generation &&
						host.props.index === index,
					`${name}: reader ${index} has stale output`,
				);
			}
		};
		const renderParent = () => root.render(Scene, { generation: ++generation });
		const updateStore = () => {
			storeUpdates++;
			runtime.flushUniversalSync(() => store.write(store.value + 1));
		};
		verify();
		for (let index = 0; index < WARMUP_ROUNDS; index++) {
			renderParent();
			updateStore();
		}
		for (let iteration = 0; iteration < iterations; iteration++) {
			let start = performance.now();
			for (let index = 0; index < OPERATIONS_PER_SAMPLE; index++) renderParent();
			samples.parent_rerenders.push((performance.now() - start) / OPERATIONS_PER_SAMPLE);
			verify();
			start = performance.now();
			for (let index = 0; index < OPERATIONS_PER_SAMPLE; index++) updateStore();
			samples.store_updates.push((performance.now() - start) / OPERATIONS_PER_SAMPLE);
			verify();
		}
		if (name === 'changing-subscribe') {
			ensure(
				store.counters.subscribeCalls === SUBSCRIBERS * (1 + generation + storeUpdates),
				'Changing subscribe identities did not replace their subscriptions',
			);
		}
	} finally {
		root.unmount();
	}
	ensure(store.listeners.size === 0, `${name}: listeners survived unmount`);
	ensure(
		store.counters.subscribeCalls === store.counters.unsubscribeCalls,
		`${name}: subscription acquisition and release are unbalanced`,
	);
	return {
		name,
		ops: {
			parent_rerenders: stat(samples.parent_rerenders),
			store_updates: stat(samples.store_updates),
			lifetime_subscribe_calls: count(store.counters.subscribeCalls),
			lifetime_unsubscribe_calls: count(store.counters.unsubscribeCalls),
		},
		meta: {
			subscribers: SUBSCRIBERS,
			parentRenders: generation,
			storeUpdates,
			finalStoreValue: store.value,
			...store.counters,
		},
	};
}

function runNotificationBurst(runtime, size, kind) {
	const store = createStore();
	const plan = createValuePlan(runtime);
	const Reader = runtime.defineUniversalComponent('object', () =>
		runtime.universalValue(plan, [
			runtime.useSyncExternalStore(store.subscribe, store.getSnapshot, undefined, 'store'),
			0,
			0,
		]),
	);
	const container = runtime.createObjectContainer();
	const root = runtime.createUniversalRoot(container, runtime.createObjectDriver());
	const samples = [];
	let notificationReads = 0;
	try {
		root.render(Reader, undefined);
		const host = container.children[0];
		for (let iteration = -BURST_WARMUPS; iteration < iterations; iteration++) {
			runtime.flushUniversalSync(() => store.write(0));
			let elapsed = 0;
			runtime.flushUniversalSync(() => {
				const before = store.counters.snapshotCalls;
				const start = performance.now();
				for (let index = 0; index < size; index++) {
					if (kind === 'unchanged') store.notify();
					else store.write(kind === 'repeated' ? 1 : index + 1);
				}
				elapsed = performance.now() - start;
				notificationReads = store.counters.snapshotCalls - before;
			});
			const expected = kind === 'unchanged' ? 0 : kind === 'repeated' ? 1 : size;
			ensure(container.children[0] === host, `${kind}/${size}: lost host identity`);
			ensure(host.props.value === expected, `${kind}/${size}: wrong committed snapshot`);
			ensure(store.listeners.size === 1, `${kind}/${size}: reader disconnected`);
			if (iteration >= 0) samples.push(elapsed);
		}
	} finally {
		root.unmount();
	}
	ensure(store.listeners.size === 0, `${kind}/${size}: listener survived unmount`);
	return { stats: stat(samples), notificationReads };
}

function createStateReader(runtime) {
	const plan = createValuePlan(runtime);
	let set;
	let get;
	const Reader = runtime.defineUniversalComponent('object', () => {
		const [value, update, read] = runtime.useState(0, 'state');
		set = update;
		get = read;
		return runtime.universalValue(plan, [value, 0, 0]);
	});
	const container = runtime.createObjectContainer();
	const root = runtime.createUniversalRoot(container, runtime.createObjectDriver());
	root.render(Reader, undefined);
	return { container, root, set: (value) => set(value), get: () => get() };
}

function runFunctionalBurst(runtime, size) {
	const state = createStateReader(runtime);
	const host = state.container.children[0];
	const samples = [];
	const increment = (value) => value + 1;
	try {
		for (let iteration = -BURST_WARMUPS; iteration < iterations; iteration++) {
			runtime.flushUniversalSync(() => state.set(0));
			let elapsed = 0;
			runtime.flushUniversalSync(() => {
				const start = performance.now();
				for (let index = 0; index < size; index++) state.set(increment);
				elapsed = performance.now() - start;
			});
			ensure(state.container.children[0] === host, `functional/${size}: lost host identity`);
			ensure(host.props.value === size && state.get() === size, `functional/${size}: wrong state`);
			if (iteration >= 0) samples.push(elapsed);
		}
	} finally {
		state.root.unmount();
	}
	return stat(samples);
}

function runReplacementWork(runtime) {
	const state = createStateReader(runtime);
	let prefixCalls = 0;
	let measuredCalls = 0;
	try {
		runtime.flushUniversalSync(() => {
			state.set((value) => {
				prefixCalls++;
				return value + 1;
			});
			// Start beyond the prefix result so the first replacement is not elided.
			for (let value = 2; value <= REPLACEMENTS + 1; value++) {
				state.set(value);
				ensure(state.get() === value, 'Replacement getter returned stale state');
			}
		});
		measuredCalls = prefixCalls;
		ensure(
			state.container.children[0].props.value === REPLACEMENTS + 1,
			'Replacement burst committed the wrong state',
		);
		// Keep this order control outside the counted prefix window.
		runtime.flushUniversalSync(() => state.set((value) => value * 2));
		ensure(
			state.get() === (REPLACEMENTS + 1) * 2 &&
				state.container.children[0].props.value === (REPLACEMENTS + 1) * 2,
			'A functional suffix did not observe the final replacement',
		);
	} finally {
		state.root.unmount();
	}
	return {
		name: 'state-replacement-burst',
		ops: { prefix_updater_calls: count(measuredCalls) },
		meta: { replacements: REPLACEMENTS, finalValue: (REPLACEMENTS + 1) * 2 },
	};
}

let tempDir;
let failure;
const targets = [];
try {
	let runtimePath = process.env.OCTANE_UNIVERSAL_STORE_RUNTIME;
	if (runtimePath === undefined) {
		const require = createRequire(new URL('../../package.json', import.meta.url));
		const { build } = require('esbuild');
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-universal-external-store-'));
		runtimePath = path.join(tempDir, 'runtime.mjs');
		await build({
			entryPoints: [path.join(REPO, 'packages/octane/src/universal-native.ts')],
			outfile: runtimePath,
			bundle: true,
			platform: 'node',
			format: 'esm',
			define: {
				'process.env.NODE_ENV': '"production"',
				__OCTANE_PROFILE_ENABLED__: 'false',
			},
			logLevel: 'silent',
		});
	}
	const runtime = await import(pathToFileURL(path.resolve(runtimePath)).href);
	for (const name of ['stable-getter', 'inline-getter', 'changing-subscribe']) {
		targets.push(runLifecycle(runtime, name));
	}
	targets.push({
		name: 'subscription-reference',
		ops: {
			lifetime_subscribe_calls: count(SUBSCRIBERS),
			lifetime_unsubscribe_calls: count(SUBSCRIBERS),
		},
		meta: { basis: 'One acquisition and release per mounted reader' },
	});
	for (const size of BURST_SIZES) {
		const ops = {};
		const notificationReads = {};
		for (const kind of ['unchanged', 'repeated', 'distinct']) {
			const result = runNotificationBurst(runtime, size, kind);
			ops[`notify_${kind}`] = result.stats;
			notificationReads[kind] = result.notificationReads;
		}
		ops.functional_updates = runFunctionalBurst(runtime, size);
		targets.push({ name: `notification-burst-${size}`, ops, meta: { size, notificationReads } });
	}
	targets.push(runReplacementWork(runtime));
	targets.push({
		name: 'state-replacement-reference',
		ops: { prefix_updater_calls: count(3) },
		meta: {
			basis: 'At most eager enqueue, first prior-value read, and ordered commit; fewer calls pass',
		},
	});
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
} finally {
	if (tempDir !== undefined) fs.rmSync(tempDir, { recursive: true, force: true });
}

const payload = {
	suite: 'universal-external-store',
	iterations,
	targets,
	...(failure ? { failed: failure } : {}),
};

console.log(`Universal external stores (${iterations} samples; timings in ms):`);
console.table(
	targets.map(({ name, ops }) => ({
		target: name,
		...Object.fromEntries(Object.entries(ops).map(([op, value]) => [op, value.score])),
	})),
);
if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
if (failure) {
	console.error(`FAIL universal-external-store: ${failure}`);
	process.exitCode = 1;
} else {
	console.log('All universal external-store semantic gates passed.');
}
