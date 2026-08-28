import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { writeHeapSnapshot } from 'node:v8';

const [engineFile, directory, cycleArgument] = process.argv.slice(2);
const cycles = Number(cycleArgument);
assert.ok(engineFile && directory && Number.isSafeInteger(cycles) && cycles >= 100);
assert.equal(typeof globalThis.gc, 'function');
assert.equal(typeof globalThis.document, 'undefined');
const api = await import(pathToFileURL(engineFile).href);

const external = (globalThis.__octaneForeignRetention = {
	producer: undefined,
	source$: undefined,
	control: undefined,
	disposedConsumers: 0,
});
const checkpoints = [];

function createConsumer(scopeKey) {
	const scope = api.createScope({ scopeKey });
	const blocked$ = scope.signal$('blocked', false);
	const view$ = scope.derived$('view', () => {
		if (blocked$.get()) throw new Error('Retained foreign value is temporarily unavailable');
		return external.source$.get();
	});
	assert.equal(view$.get(), 7);
	blocked$.set(true);
	// Evaluating the failed branch drops its foreign graph edge. latest() must
	// still expose the old success while its producer remains alive.
	assert.equal(view$.latest(null), 7);
	assert.equal(view$.snapshot().status, 'error');
	return { scope, view$ };
}

function initialize() {
	external.producer = api.createScope({ scopeKey: 'foreign-retention/producer' });
	external.source$ = external.producer.signal$('source', 7);
	external.control = createConsumer('foreign-retention/control');
}

function cycle(index) {
	const consumer = createConsumer('foreign-retention/consumer-' + index);
	consumer.scope.dispose();
	assert.throws(() => consumer.view$.get(), api.ScopeDisposedError);
	consumer.scope.dispose();
	external.disposedConsumers++;
}

function retireControl() {
	assert.equal(external.control.view$.latest(null), 7);
	external.control.scope.dispose();
	external.control = undefined;
}

function retireProducer() {
	external.producer.dispose();
	external.producer = undefined;
	external.source$ = undefined;
}

async function checkpoint(index, phase) {
	// Every cycle has returned before collection, so no benchmark stack retains
	// its consumer, error, handle, or callback. Raw heaps remain local.
	for (let attempt = 0; attempt < 3; attempt++) {
		await nextTurn();
		globalThis.gc();
	}
	const snapshot = writeHeapSnapshot(path.join(directory, phase + '-' + index + '.heapsnapshot'));
	const row = {
		cycle: index,
		phase,
		disposedConsumers: external.disposedConsumers,
		liveScopeKeys:
			phase === 'active-control'
				? ['foreign-retention/producer', 'foreign-retention/control']
				: phase === 'control-retired'
					? ['foreign-retention/producer']
					: [],
		expectedLiveSignals: phase === 'active-control' ? 3 : phase === 'control-retired' ? 1 : 0,
		memory: process.memoryUsage(),
		snapshot,
	};
	checkpoints.push(row);
	fs.writeFileSync(
		path.join(directory, 'checkpoints.json'),
		JSON.stringify(checkpoints, null, 2) + '\n',
	);
	console.log(
		`${phase} after ${index} cycles: ${row.liveScopeKeys.length} intentionally live scopes`,
	);
}

initialize();
await checkpoint(0, 'active-control');
for (let index = 1; index <= cycles; index++) {
	cycle(index);
	if (index === 100 || index === cycles) await checkpoint(index, 'active-control');
}
assert.equal(external.disposedConsumers, cycles);
external.source$.set(9);
assert.equal(external.source$.get(), 9, 'Reader retirement leaves the foreign producer writable');
assert.equal(
	external.control.view$.latest(null),
	7,
	'The surviving failed branch retains its prior success',
);
retireControl();
await checkpoint(cycles, 'control-retired');
retireProducer();
await checkpoint(cycles, 'all-retired');
