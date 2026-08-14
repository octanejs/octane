import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
	holdFirstTimeout,
	holdNextTimeout,
} = require('../../packages/swr/audit/upstream-timer-gate.cjs');

test('holds a request completion until the competing mutation has started', () => {
	const events = [];
	const originalSetTimeout = globalThis.setTimeout;
	const originalClearTimeout = globalThis.clearTimeout;

	const held = holdFirstTimeout(10, () => {
		setTimeout(() => events.push('request completed'), 10);
		return 'rendered';
	});

	assert.equal(held.result, 'rendered');
	assert.deepEqual(events, []);
	events.push('mutation started');
	held.release();
	assert.deepEqual(events, ['mutation started', 'request completed']);
	assert.throws(() => held.release(), /already been released/);
	assert.equal(globalThis.setTimeout, originalSetTimeout);
	assert.equal(globalThis.clearTimeout, originalClearTimeout);
});

test('holds an asynchronously scheduled revalidation until its in-flight state is observed', async () => {
	const events = [];
	const gate = holdNextTimeout(30);
	queueMicrotask(() => {
		setTimeout(() => events.push('revalidation completed'), 30);
	});

	events.push('isValidating:true observed');
	assert.deepEqual(events, ['isValidating:true observed']);
	gate.releaseWhenScheduled();
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.deepEqual(events, ['isValidating:true observed', 'revalidation completed']);
});
