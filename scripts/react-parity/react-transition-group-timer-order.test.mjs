import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
	drainZeroDelayTimers,
} = require('../../packages/transition-group/tests/upstream-timer-order.cjs');

test('drains a transition zero-delay completion before an earlier guard timer', () => {
	const events = [];
	const originalSetTimeout = globalThis.setTimeout;
	const originalClearTimeout = globalThis.clearTimeout;
	const guard = setTimeout(() => events.push('guard'), 0);

	drainZeroDelayTimers(
		() => {
			setTimeout(() => events.push('completion'), 0);
		},
		(callback) => callback(),
	);

	clearTimeout(guard);
	assert.deepEqual(events, ['completion']);
	assert.equal(globalThis.setTimeout, originalSetTimeout);
	assert.equal(globalThis.clearTimeout, originalClearTimeout);
});
