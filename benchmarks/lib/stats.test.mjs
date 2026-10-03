import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pairedRatio } from './stats.mjs';

// Shared runner drift: every pair moves together, as alternating base/head
// samples in one browser do.
const drift = (count) => Array.from({ length: count }, (_, i) => 10 * (1 + 0.4 * Math.sin(i)));

test('a consistent per-pair slowdown is resolved through drift larger than the change', () => {
	const base = drift(30);
	const head = base.map((value, i) => value * 1.05 * (1 + 0.005 * Math.cos(i * 7)));
	const { ratio, low, high, pairs } = pairedRatio(base, head);
	assert.equal(pairs, 30);
	assert.ok(Math.abs(ratio - 1.05) < 0.01, `ratio ${ratio}`);
	assert.ok(low > 1.03 && high < 1.07, `interval [${low}, ${high}]`);
});

test('identical samples give a degenerate interval at exactly 1', () => {
	const base = drift(30);
	assert.deepEqual(pairedRatio(base, base), { ratio: 1, low: 1, high: 1, pairs: 30 });
});

test('pairs that disagree widen the interval across 1 instead of producing a verdict', () => {
	const base = drift(30);
	const head = base.map((value, i) => value * (i % 2 ? 1.3 : 0.75));
	const { low, high } = pairedRatio(base, head);
	assert.ok(low < 0.97 && high > 1.03, `interval [${low}, ${high}]`);
});

test('the bootstrap is seeded, so one sample set always gives one interval', () => {
	const base = drift(30);
	const head = base.map((value, i) => value * (1 + 0.1 * Math.sin(i * 3)));
	assert.deepEqual(pairedRatio(base, head), pairedRatio(base, head));
});

test('unpaired sample sets are rejected', () => {
	assert.throws(() => pairedRatio([1, 2, 3], [1, 2]), /equal sample counts/);
	assert.throws(() => pairedRatio([1], [1]), /at least 2/);
});
