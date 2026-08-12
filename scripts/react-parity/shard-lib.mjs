export function parseShard(value = '1/1') {
	if (typeof value !== 'string') throw new TypeError('shard must be a string');
	const match = /^(\d+)\/(\d+)$/.exec(value);
	if (!match) throw new Error('shard must use the form <index>/<total>');

	const index = Number(match[1]);
	const total = Number(match[2]);
	if (total < 1) throw new Error('shard total must be positive');
	if (index < 1 || index > total) {
		throw new Error('shard index must be between 1 and its total');
	}
	return { index, total, value: `${index}/${total}` };
}

export function createBalancedShardPlan(items, shardCount) {
	if (!Array.isArray(items)) throw new TypeError('items must be an array');
	if (!Number.isInteger(shardCount) || shardCount < 1) {
		throw new TypeError('shardCount must be a positive integer');
	}

	const ids = new Set();
	const ordered = items
		.map((item) => {
			if (!item || typeof item.id !== 'string' || item.id.length === 0) {
				throw new TypeError('every shard item must have a non-empty string id');
			}
			if (ids.has(item.id)) throw new Error(`duplicate shard item id: ${item.id}`);
			ids.add(item.id);
			if (!Number.isFinite(item.weight) || item.weight <= 0) {
				throw new TypeError(`shard item ${item.id} must have a positive finite weight`);
			}
			return item;
		})
		.sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id));

	const shards = Array.from({ length: shardCount }, (_, index) => ({
		index: index + 1,
		total: shardCount,
		estimatedWeight: 0,
		items: [],
	}));
	for (const item of ordered) {
		const shard = shards.reduce((lightest, candidate) => {
			if (candidate.estimatedWeight !== lightest.estimatedWeight) {
				return candidate.estimatedWeight < lightest.estimatedWeight ? candidate : lightest;
			}
			if (candidate.items.length !== lightest.items.length) {
				return candidate.items.length < lightest.items.length ? candidate : lightest;
			}
			return candidate.index < lightest.index ? candidate : lightest;
		});
		shard.items.push(item);
		shard.estimatedWeight += item.weight;
	}
	return shards;
}
