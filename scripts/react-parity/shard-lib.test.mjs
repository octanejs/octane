import assert from 'node:assert/strict';
import test from 'node:test';

import { createBalancedShardPlan, parseShard } from './shard-lib.mjs';

test('parses generic parity shard coordinates', () => {
	assert.deepEqual(parseShard(), { index: 1, total: 1, value: '1/1' });
	assert.deepEqual(parseShard('2/3'), { index: 2, total: 3, value: '2/3' });
	assert.throws(() => parseShard('2'), /form <index>\/<total>/);
	assert.throws(() => parseShard('0/2'), /between 1 and its total/);
	assert.throws(() => parseShard('3/2'), /between 1 and its total/);
	assert.throws(() => parseShard('1/0'), /total must be positive/);
});

test('keeps weighted work whole, complete, and deterministic for any shard count', () => {
	const items = [
		{ id: 'heavy', weight: 10 },
		{ id: 'medium', weight: 7 },
		{ id: 'small-a', weight: 4 },
		{ id: 'small-b', weight: 4 },
		{ id: 'tiny', weight: 1 },
	];
	const twoShards = createBalancedShardPlan(items, 2);
	assert.deepEqual(
		twoShards.map((shard) => ({
			weight: shard.estimatedWeight,
			ids: shard.items.map((item) => item.id),
		})),
		[
			{ weight: 14, ids: ['heavy', 'small-b'] },
			{ weight: 12, ids: ['medium', 'small-a', 'tiny'] },
		],
	);

	const threeShards = createBalancedShardPlan(items, 3);
	assert.deepEqual(
		threeShards.flatMap((shard) => shard.items.map((item) => item.id)).sort(),
		items.map((item) => item.id).sort(),
	);
	assert.equal(new Set(threeShards.flatMap((shard) => shard.items)).size, items.length);
	assert.deepEqual(createBalancedShardPlan(items, 3), threeShards);
});

test('rejects shard plans whose identity or weight cannot prove exact ownership', () => {
	assert.throws(
		() =>
			createBalancedShardPlan(
				[
					{ id: 'same', weight: 1 },
					{ id: 'same', weight: 2 },
				],
				2,
			),
		/duplicate shard item id: same/,
	);
	assert.throws(
		() => createBalancedShardPlan([{ id: 'invalid', weight: 0 }], 2),
		/positive finite weight/,
	);
});
