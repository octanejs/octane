import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getDeepestNode } from '../../packages/floating-ui/src/utils/nodes.ts';
import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const iterations = Number.parseInt(process.argv[2] ?? '8', 10);
if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('Floating tree navigation iterations must be a positive integer');
}

const fullSize = iterations <= 3 ? 12 : 16;
const lookupsPerSample = iterations <= 3 ? 2 : 4;

function node(id, parentId, open = true) {
	return { id, parentId, context: { open } };
}

function createChain(size) {
	return Array.from({ length: size }, (_, index) =>
		node(`chain-${index}`, index === 0 ? null : `chain-${index - 1}`),
	);
}

function createFork(depth) {
	const root = node('fork-root', null);
	const nodes = [root];
	for (let level = 1; level <= depth; level++) {
		nodes.push(
			node(`left-${level}`, level === 1 ? root.id : `left-${level - 1}`),
			node(`right-${level}`, level === 1 ? root.id : `right-${level - 1}`),
		);
	}
	return nodes;
}

function previousGetNodeChildren(nodes, id) {
	const directChildren = nodes.filter((entry) => entry.parentId === id && entry.context?.open);
	return directChildren.flatMap((child) => [child, ...previousGetNodeChildren(nodes, child.id)]);
}

function previousGetDeepestNode(nodes, id) {
	let deepestNodeId;
	let maxDepth = -1;
	function findDeepest(nodeId, depth) {
		if (depth > maxDepth) {
			deepestNodeId = nodeId;
			maxDepth = depth;
		}
		for (const child of previousGetNodeChildren(nodes, nodeId)) {
			findDeepest(child.id, depth + 1);
		}
	}
	findDeepest(id, 0);
	return nodes.find((entry) => entry.id === deepestNodeId);
}

function countNodeReads(nodes, lookup, rootId) {
	let reads = 0;
	const counted = new Proxy(nodes, {
		get(target, property, receiver) {
			if (typeof property === 'string' && /^(0|[1-9]\d*)$/.test(property)) reads++;
			return Reflect.get(target, property, receiver);
		},
	});
	return { result: lookup(counted, rootId), reads };
}

const correctnessFixtures = [
	{ name: 'root-only', nodes: [node('root', null)], rootId: 'root' },
	{
		name: 'closed-branch',
		nodes: [
			node('root', null),
			node('closed', 'root', false),
			node('hidden', 'closed'),
			node('visible', 'root'),
		],
		rootId: 'root',
	},
	{
		name: 'missing-root',
		nodes: [node('child', 'missing'), node('leaf', 'child')],
		rootId: 'missing',
	},
	{ name: 'equal-depth-fork', nodes: createFork(4), rootId: 'fork-root' },
];

for (const fixture of correctnessFixtures) {
	assert.equal(
		getDeepestNode(fixture.nodes, fixture.rootId),
		previousGetDeepestNode(fixture.nodes, fixture.rootId),
		`${fixture.name} changed deepest-node identity`,
	);
}

const scenarios = [
	{ name: 'deep-chain', nodes: createChain(fullSize), rootId: 'chain-0' },
	{ name: 'equal-depth-fork', nodes: createFork(Math.floor(fullSize / 2)), rootId: 'fork-root' },
	{ name: 'root-only', nodes: [node('root', null)], rootId: 'root' },
];
const implementations = [
	{ name: 'previous', lookup: previousGetDeepestNode },
	{ name: 'indexed', lookup: getDeepestNode },
];

function sample(implementation, scenario, repetitions) {
	let checksum = '';
	const started = performance.now();
	for (let index = 0; index < repetitions; index++) {
		checksum = implementation.lookup(scenario.nodes, scenario.rootId)?.id ?? '';
	}
	const elapsed = performance.now() - started;
	assert.ok(checksum, `${implementation.name}/${scenario.name} returned no node`);
	return elapsed / repetitions;
}

const samples = new Map();
for (const scenario of scenarios) {
	for (const implementation of implementations) {
		const key = `${implementation.name}-${scenario.name}`;
		samples.set(key, []);
		sample(implementation, scenario, lookupsPerSample);
	}
}

for (let iteration = 0; iteration < iterations; iteration++) {
	const implementationOrder = iteration % 2 === 0 ? implementations : implementations.toReversed();
	const scenarioOrder = iteration % 2 === 0 ? scenarios : scenarios.toReversed();
	for (const scenario of scenarioOrder) {
		for (const implementation of implementationOrder) {
			const repetitions = scenario.name === 'root-only' ? 20_000 : lookupsPerSample;
			samples
				.get(`${implementation.name}-${scenario.name}`)
				.push(sample(implementation, scenario, repetitions));
		}
	}
}

const targets = [];
for (const scenario of scenarios) {
	const expected = previousGetDeepestNode(scenario.nodes, scenario.rootId);
	for (const implementation of implementations) {
		const key = `${implementation.name}-${scenario.name}`;
		const counted = countNodeReads(scenario.nodes, implementation.lookup, scenario.rootId);
		assert.equal(counted.result, expected, `${key} changed node identity`);
		const lookup = timingStatForJson(summarizeSamples(samples.get(key)));
		const nodeReads = deterministicStatForJson(deterministicCount(counted.reads));
		targets.push({
			name: key,
			ops: { lookup, node_reads: nodeReads },
			meta: {
				nodes: scenario.nodes.length,
				rootId: scenario.rootId,
				resultId: counted.result?.id,
				correctness: 'pass',
			},
		});
		console.log(
			`PASS floating-tree-navigation/${key}: ${counted.reads.toLocaleString()} node reads, ` +
				`${lookup.score.toFixed(6)}ms/lookup`,
		);
	}
}

const payload = { suite: 'floating-tree-navigation', iterations, targets };
if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
