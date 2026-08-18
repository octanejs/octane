import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { holdFirstTimeout } = require('../../packages/swr/audit/upstream-timer-gate.cjs');

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

test('holds an initial request until its shared in-flight state is observed', () => {
	const events = [];
	const originalSetTimeout = globalThis.setTimeout;
	const originalClearTimeout = globalThis.clearTimeout;

	const held = holdFirstTimeout(30, () => {
		setTimeout(() => events.push('revalidation completed'), 30);
		return 'rendered';
	});

	assert.equal(held.result, 'rendered');
	events.push('isValidating:true observed');
	assert.deepEqual(events, ['isValidating:true observed']);
	held.release();
	assert.deepEqual(events, ['isValidating:true observed', 'revalidation completed']);
	assert.throws(() => held.release(), /already been released/);
	assert.equal(globalThis.setTimeout, originalSetTimeout);
	assert.equal(globalThis.clearTimeout, originalClearTimeout);
});
