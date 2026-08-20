import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
	createSupersedingTimeoutGate,
	holdFirstTimeout,
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

test('holds superseded mutation completions until the following mutation starts', () => {
	const events = [];
	const scheduled = [];
	const originalSetTimeout = globalThis.setTimeout;
	const originalClearTimeout = globalThis.clearTimeout;

	globalThis.setTimeout = (callback, delay) => {
		const token = { callback, delay };
		scheduled.push(token);
		return token;
	};
	globalThis.clearTimeout = (token) => {
		const index = scheduled.indexOf(token);
		if (index !== -1) scheduled.splice(index, 1);
	};

	try {
		const gate = createSupersedingTimeoutGate(10, 2);
		const trigger = (id) => {
			events.push(`mutation ${id} started`);
			setTimeout(() => events.push(`mutation ${id} completed`), 10);
		};

		gate.run(() => trigger(0));
		assert.deepEqual(events, ['mutation 0 started']);

		gate.run(() => trigger(1));
		assert.deepEqual(events, ['mutation 0 started', 'mutation 1 started', 'mutation 0 completed']);

		gate.run(() => trigger(2));
		assert.deepEqual(events, [
			'mutation 0 started',
			'mutation 1 started',
			'mutation 0 completed',
			'mutation 2 started',
			'mutation 1 completed',
		]);
		assert.equal(scheduled.length, 1);
		assert.equal(scheduled[0].delay, 10);

		scheduled.shift().callback();
		assert.deepEqual(events.at(-1), 'mutation 2 completed');
	} finally {
		globalThis.setTimeout = originalSetTimeout;
		globalThis.clearTimeout = originalClearTimeout;
	}
});
