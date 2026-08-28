import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
	COLLECTION_ORDER_INDEX_THRESHOLD,
	sortCollectionItemsByDomOrder,
} from '../../packages/radix/src/collection-order.ts';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const iterations = Number.parseInt(process.argv[2] ?? '8', 10);
const sizes = [16, 64, 256, 4_096];

assert.equal(COLLECTION_ORDER_INDEX_THRESHOLD, 256);

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('Radix collection ordering iterations must be a positive integer');
}

function sortWithCurrentComparator(orderedNodes, items) {
	return items.sort(
		(a, b) => orderedNodes.indexOf(a.ref.current) - orderedNodes.indexOf(b.ref.current),
	);
}

function createScenario(size) {
	const orderedNodes = Array.from({ length: size }, (_, index) => ({ index }));
	const items = Array.from({ length: size }, (_, index) => {
		const nodeIndex = (index * 2_654_435_761) % size;
		return { id: index, ref: { current: orderedNodes[nodeIndex] } };
	});
	const expected = [...items].sort((a, b) => a.ref.current.index - b.ref.current.index);
	const checksum = checksumOrder(expected);
	return {
		size,
		orderedNodes,
		items,
		expectedIds: expected.map((item) => item.id),
		checksum,
		ordersPerSample: size <= 16 ? 20_000 : size <= 64 ? 2_000 : size <= 256 ? 100 : 1,
	};
}

function checksumOrder(items) {
	return items.reduce((sum, item, index) => sum + (index + 1) * (item.id + 1), 0);
}

function verifyEdgeCases(sortProduction) {
	const first = { name: 'first' };
	const second = { name: 'second' };
	const outside = { name: 'outside' };
	const items = [
		{ id: 'outside-a', ref: { current: outside } },
		{ id: 'second', ref: { current: second } },
		{ id: 'null', ref: { current: null } },
		{ id: 'first-a', ref: { current: first } },
		{ id: 'outside-b', ref: { current: outside } },
		{ id: 'first-b', ref: { current: first } },
	];
	const expected = ['outside-a', 'null', 'outside-b', 'first-a', 'first-b', 'second'];
	for (const sort of [sortWithCurrentComparator, sortProduction]) {
		assert.deepEqual(
			sort([first, second], [...items]).map((item) => item.id),
			expected,
		);
		assert.deepEqual(sort([], []), []);
		assert.deepEqual(sort([first], [items[3]]), [items[3]]);
	}

	const positionedNodes = Array.from(
		{ length: COLLECTION_ORDER_INDEX_THRESHOLD - 2 },
		(_, index) => ({ index }),
	);
	const indexedNodes = [first, second, ...positionedNodes];
	const indexedItems = [
		...items,
		...positionedNodes
			.slice(0, COLLECTION_ORDER_INDEX_THRESHOLD - items.length)
			.map((node, index) => ({ id: `positioned-${index}`, ref: { current: node } })),
	];
	const indexedExpected = sortWithCurrentComparator(indexedNodes, [...indexedItems]).map(
		(item) => item.id,
	);
	assert.equal(indexedItems.length, COLLECTION_ORDER_INDEX_THRESHOLD);
	assert.deepEqual(indexedExpected.slice(0, expected.length), expected);
	assert.deepEqual(
		sortProduction(indexedNodes, [...indexedItems]).map((item) => item.id),
		indexedExpected,
	);
}

function sample(sort, scenario) {
	let ordered;
	const started = performance.now();
	for (let order = 0; order < scenario.ordersPerSample; order++) {
		ordered = sort(scenario.orderedNodes, [...scenario.items]);
	}
	return {
		elapsed: performance.now() - started,
		checksum: checksumOrder(ordered) * scenario.ordersPerSample,
	};
}

verifyEdgeCases(sortCollectionItemsByDomOrder);

const implementations = [
	{ name: 'reference', sort: sortWithCurrentComparator },
	{ name: 'production', sort: sortCollectionItemsByDomOrder },
];
const scenarios = sizes.map(createScenario);
const samples = new Map();

for (const scenario of scenarios) {
	for (const implementation of implementations) {
		const ordered = implementation.sort(scenario.orderedNodes, [...scenario.items]);
		assert.deepEqual(
			ordered.map((item) => item.id),
			scenario.expectedIds,
		);
		assert.equal(checksumOrder(ordered), scenario.checksum);
		sample(implementation.sort, scenario);
		samples.set(`${implementation.name}-${scenario.size}`, []);
	}
}

for (let iteration = 0; iteration < iterations; iteration++) {
	const scenarioOrder = iteration % 2 === 0 ? scenarios : scenarios.toReversed();
	for (const scenario of scenarioOrder) {
		const implementationOrder =
			iteration % 2 === 0 ? implementations : implementations.toReversed();
		for (const implementation of implementationOrder) {
			const result = sample(implementation.sort, scenario);
			assert.equal(result.checksum, scenario.checksum * scenario.ordersPerSample);
			samples
				.get(`${implementation.name}-${scenario.size}`)
				.push((result.elapsed * 1_000) / scenario.ordersPerSample);
		}
	}
}

const rows = [];
for (const scenario of scenarios) {
	for (const implementation of implementations) {
		const name = `${implementation.name}-${scenario.size}`;
		const order = timingStatForJson(summarizeSamples(samples.get(name)));
		rows.push({
			name,
			ops: { order },
			meta: {
				items: scenario.size,
				algorithm:
					implementation.name === 'production' && scenario.size >= COLLECTION_ORDER_INDEX_THRESHOLD
						? 'indexed'
						: 'index-of',
				ordersPerSample: scenario.ordersPerSample,
				checksum: scenario.checksum,
				correctness: 'pass',
			},
		});
		console.log(`PASS radix-collection-order/${name}: ${order.score.toFixed(3)}us/order`);
	}
}

const payload = {
	suite: 'radix-collection-order',
	iterations,
	targets: rows,
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
