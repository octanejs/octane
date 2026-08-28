import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alienAdapter, continuousDisposal, createGraph, GRAPH_SHAPES } from './workloads.mjs';

function rawEffectFixture() {
	const effects = new Set();
	let depth = 0;
	function notify() {
		if (depth !== 0) return;
		for (const effect of effects) effect();
	}
	return {
		signal(initial) {
			let value = initial;
			return (...args) => {
				if (args.length === 0) return value;
				value = args[0];
				notify();
			};
		},
		computed: (read) => read,
		effect(run) {
			effects.add(run);
			run();
			return () => effects.delete(run);
		},
		startBatch() {
			depth++;
		},
		endBatch() {
			depth--;
			notify();
		},
	};
}

test('the raw adapter normalizes initial effect execution and supports idempotent unsubscribe', () => {
	const adapter = alienAdapter(rawEffectFixture());
	const owner = adapter.create('raw');
	const value$ = adapter.signal$(owner, 'value', 0);
	const values = [];
	const stop = adapter.subscribe(owner, value$, (value) => values.push(value));
	assert.deepEqual(values, []);
	adapter.write(owner, value$, 1);
	assert.deepEqual(values, [1]);
	stop();
	stop();
	adapter.write(owner, value$, 2);
	assert.deepEqual(values, [1]);
	adapter.dispose(owner);
});

test('a throwing raw batch still publishes its writes and restores subsequent notifications', () => {
	const adapter = alienAdapter(rawEffectFixture());
	const owner = adapter.create('raw');
	const value$ = adapter.signal$(owner, 'value', 0);
	const values = [];
	adapter.subscribe(owner, value$, (value) => values.push(value));
	try {
		assert.throws(
			() =>
				adapter.batch(owner, () => {
					adapter.write(owner, value$, 1);
					throw new Error('user batch failed');
				}),
			/user batch failed/,
		);
		assert.deepEqual(values, [1]);
		adapter.write(owner, value$, 2);
		assert.deepEqual(values, [1, 2]);
	} finally {
		adapter.dispose(owner);
	}
});

// A deliberately unoptimized reference interpreter checks the benchmark's
// oracle without importing either candidate. It recomputes every observation
// on every write; a correct graph implementation need not use the same work.
function referenceAdapter({
	dropNotifications = false,
	leakConsumers = false,
	earlyBatch = false,
} = {}) {
	const observers = new Set();
	let depth = 0;
	function publish() {
		if (dropNotifications || (depth > 0 && !earlyBatch)) return;
		for (const observer of observers) {
			const next = observer.value$.read();
			if (Object.is(next, observer.previous)) continue;
			observer.previous = next;
			observer.report(next);
		}
	}
	return {
		name: 'reference',
		create: () => ({}),
		signal$(_owner, _key, initial) {
			return {
				value: initial,
				read() {
					return this.value;
				},
			};
		},
		derived$: (_owner, _key, read) => ({ read }),
		read$: (_owner, value$) => value$.read(),
		write(_owner, value$, value) {
			value$.value = value;
			publish();
		},
		batch(_owner, run) {
			depth++;
			try {
				return run();
			} finally {
				depth--;
				if (depth === 0) publish();
			}
		},
		subscribe(owner, value$, report) {
			const observer = { owner, value$, report, previous: value$.read() };
			observers.add(observer);
			return () => observers.delete(observer);
		},
		dispose(owner) {
			if (leakConsumers) return;
			for (const observer of observers) {
				if (observer.owner === owner) observers.delete(observer);
			}
		},
	};
}

for (const shape of GRAPH_SHAPES) {
	test(`${shape} accepts correct values and notification delivery without requiring a particular graph algorithm`, () => {
		const graph = createGraph(referenceAdapter(), shape, 8, shape);
		try {
			graph.verify();
			let version = 1;
			for (const operation of graph.operations) {
				for (let index = 0; index < 5; index++) {
					graph.step(operation, version++);
					graph.verify();
				}
			}
		} finally {
			graph.dispose();
		}
	});
}

test('a correct final read cannot hide a missed subscriber update', () => {
	const graph = createGraph(
		referenceAdapter({ dropNotifications: true }),
		'independent',
		4,
		'missing',
	);
	try {
		graph.step('write_sparse', 1);
		assert.throws(() => graph.verify(), /missed notification/);
	} finally {
		graph.dispose();
	}
});

test('early notification during a batch fails even when the final values are correct', () => {
	const graph = createGraph(referenceAdapter({ earlyBatch: true }), 'independent', 4, 'early');
	try {
		graph.step('batch_write_all', 1);
		assert.throws(() => graph.verify(), /incoherent notification/);
	} finally {
		graph.dispose();
	}
});

test('continuous ownership keeps a shared producer live across partial and repeated teardown', async () => {
	const checkpoints = [];
	const result = await continuousDisposal(referenceAdapter(), {
		cycles: 6,
		width: 4,
		unrelated: 5,
		checkpoint: async (state) => {
			checkpoints.push(state);
		},
	});
	assert.deepEqual(result, {
		cycles: 6,
		width: 4,
		unrelated: 5,
		lateNotifications: 0,
		finalValue: 18,
	});
	assert.deepEqual(checkpoints, [
		{ cycle: 0, disposedOwners: 0, lateNotifications: 0 },
		{ cycle: 6, disposedOwners: 12, lateNotifications: 0 },
	]);
});

test('a disposed consumer that still receives updates fails the continuous workload', async () => {
	await assert.rejects(
		continuousDisposal(referenceAdapter({ leakConsumers: true }), { cycles: 3, width: 2 }),
		/disposed consumer received an update/,
	);
});
