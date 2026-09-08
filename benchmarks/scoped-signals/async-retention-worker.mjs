import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { writeHeapSnapshot } from 'node:v8';

const [engineFile, snapshotDirectory, cycleArgument] = process.argv.slice(2);
const cycles = Number(cycleArgument);
assert.ok(engineFile && snapshotDirectory && Number.isSafeInteger(cycles) && cycles >= 100);
assert.equal(typeof globalThis.gc, 'function', 'The retention worker requires --expose-gc');
assert.equal(typeof globalThis.document, 'undefined', 'This diagnostic must run without a DOM');
const api = await import(pathToFileURL(engineFile).href);

// This global is an intentional external producer owner. It contains no retired
// Scope, signal handle, or callback that captures one. Pending promises carry
// only known benchmark labels so the offline scanner can identify them.
const external = (globalThis.__octaneAsyncRetention = {
	producers: [],
	liveControl: undefined,
	counters: {
		promiseStarts: 0,
		promiseAborts: 0,
		streamStarts: 0,
		streamAborts: 0,
		streamNexts: 0,
		streamReturns: 0,
	},
});
const checkpoints = [];
function neverResolve() {}
function ignoreNotification() {}
function promiseAborted() {
	external.counters.promiseAborts++;
}
function streamAborted() {
	external.counters.streamAborts++;
}
function retainPending(kind, origin) {
	const promise = new Promise(neverResolve);
	Object.defineProperties(promise, {
		octaneRetentionProducerKind: { value: kind },
		octaneRetentionOrigin: { value: origin },
	});
	external.producers.push(promise);
	return promise;
}
function loadPromise(origin, { signal }) {
	external.counters.promiseStarts++;
	signal.addEventListener('abort', promiseAborted, { once: true });
	// Aborting is observed but deliberately cannot settle this producer.
	return retainPending('promise', origin);
}
class RetentionStreamIterator {
	constructor(origin) {
		this.octaneRetentionIterator = origin;
	}
	[Symbol.asyncIterator]() {
		return this;
	}
	next() {
		external.counters.streamNexts++;
		return retainPending('stream-next', this.octaneRetentionIterator);
	}
	return() {
		external.counters.streamReturns++;
		// Neither next nor return settles. The engine must revoke its own lease
		// without requiring cooperation from this iterator.
		return retainPending('stream-return', this.octaneRetentionIterator);
	}
}
function loadStream(origin, { signal }) {
	external.counters.streamStarts++;
	signal.addEventListener('abort', streamAborted, { once: true });
	return new RetentionStreamIterator(origin);
}
const promiseQuery = api.query('async-retention/promise', loadPromise);
const streamQuery = api.query('async-retention/stream', loadStream, { kind: 'stream' });

function createOwnedResource(scope, query, slot, argument$) {
	const resource$ = scope.asyncSignal$(slot, () => query(argument$.get()));
	assert.equal(resource$.snapshot().status, 'pending');
	resource$.subscribe(ignoreNotification);
	return resource$;
}

async function setupLiveControl() {
	const scope = api.createScope({ scopeKey: 'async-retention/control-live' });
	const argument$ = scope.signal$('argument', 'async-retention/control-live');
	const promise$ = createOwnedResource(scope, promiseQuery, 'promise', argument$);
	const stream$ = createOwnedResource(scope, streamQuery, 'stream', argument$);
	const summary$ = scope.derived$(
		'summary',
		() => promise$.latest('pending') + ':' + stream$.latest('pending'),
	);
	assert.equal(summary$.get(), 'pending:pending');
	summary$.subscribe(ignoreNotification);
	external.liveControl = scope;
	await Promise.resolve();
	assert.equal(external.counters.streamNexts, 1, 'The positive-control stream must start next()');
}

function disposedPromiseCycle(cycle) {
	const scope = api.createScope({ scopeKey: `async-retention/promise/${cycle}` });
	const argument$ = scope.signal$('argument', `async-retention/promise/${cycle}`);
	const resource$ = createOwnedResource(scope, promiseQuery, 'resource', argument$);
	const view$ = scope.derived$('view', () => resource$.latest('pending'));
	assert.equal(view$.get(), 'pending');
	view$.subscribe(ignoreNotification);
	const before = external.counters.promiseAborts;
	scope.dispose();
	assert.equal(external.counters.promiseAborts, before + 1);
	assert.throws(() => resource$.get(), api.ScopeDisposedError);
	scope.dispose();
	assert.equal(external.counters.promiseAborts, before + 1);
}

async function disposedStreamCycle(cycle) {
	const scope = api.createScope({ scopeKey: `async-retention/stream/${cycle}` });
	const argument$ = scope.signal$('argument', `async-retention/stream/${cycle}`);
	const resource$ = createOwnedResource(scope, streamQuery, 'resource', argument$);
	const view$ = scope.derived$('view', () => resource$.latest('pending'));
	assert.equal(view$.get(), 'pending');
	view$.subscribe(ignoreNotification);
	const before = { ...external.counters };
	await Promise.resolve();
	assert.equal(external.counters.streamNexts, before.streamNexts + 1);
	scope.dispose();
	assert.equal(external.counters.streamAborts, before.streamAborts + 1);
	assert.equal(external.counters.streamReturns, before.streamReturns + 1);
	assert.throws(() => resource$.get(), api.ScopeDisposedError);
	scope.dispose();
	assert.equal(external.counters.streamReturns, before.streamReturns + 1);
}

function retireLiveControl() {
	external.liveControl.dispose();
	external.liveControl = undefined;
}

async function checkpoint(cycle, phase) {
	// Return through a full event-loop turn before collecting, so a resolved
	// async cycle's stack/Promise cannot accidentally hold the last owner.
	for (let attempt = 0; attempt < 3; attempt++) {
		await nextTurn();
		globalThis.gc();
	}
	const memory = process.memoryUsage();
	const snapshot = writeHeapSnapshot(
		path.join(snapshotDirectory, `${phase}-${cycle}.heapsnapshot`),
	);
	const row = {
		cycle,
		phase,
		disposedCycleOwners: cycle * 2,
		expectedLiveScopes: phase === 'active-control' ? 1 : 0,
		externallyRetainedProducers: external.producers.length,
		counters: { ...external.counters },
		memory,
		snapshot,
	};
	checkpoints.push(row);
	fs.writeFileSync(
		path.join(snapshotDirectory, 'checkpoints.json'),
		JSON.stringify(checkpoints, null, 2) + '\n',
	);
	console.log(
		`${phase} at ${cycle}: ${row.externallyRetainedProducers} external pending producers; ${row.expectedLiveScopes} expected live scope(s)`,
	);
}

await setupLiveControl();
await checkpoint(0, 'active-control');
for (let cycle = 1; cycle <= cycles; cycle++) {
	disposedPromiseCycle(cycle);
	await disposedStreamCycle(cycle);
	if (cycle === 100 || cycle === cycles) await checkpoint(cycle, 'active-control');
}
assert.deepEqual(external.counters, {
	promiseStarts: cycles + 1,
	promiseAborts: cycles,
	streamStarts: cycles + 1,
	streamAborts: cycles,
	streamNexts: cycles + 1,
	streamReturns: cycles,
});
assert.equal(external.producers.length, cycles * 3 + 2);
retireLiveControl();
await checkpoint(cycles, 'control-retired');
assert.equal(external.producers.length, cycles * 3 + 3);
external.producers.length = 0;
await checkpoint(cycles, 'external-producers-released');
