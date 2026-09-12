// Compare the actual runtime comparator from a Git revision with the worktree.
// This focused bench runs without DOM or workspace dependencies. It also checks
// the expected postorder, including uneven sibling depths, before timing.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { performance } from 'node:perf_hooks';

const file = 'packages/octane/src/runtime.ts';
const baseRef = process.argv[2] ?? 'upstream/main';

function comparator(source) {
	const start = source.indexOf('function blockIsAncestorOf(');
	const end = source.indexOf('function finishEffectCommit()', start);
	if (start < 0 || end < 0) throw new Error('Effect comparator source moved');
	const code = stripTypeScriptTypes(source.slice(start, end));
	return Function(`${code}\nreturn comparePostOrder;`)();
}

const baseline = comparator(
	execFileSync('git', ['show', `${baseRef}:${file}`], {
		encoding: 'utf8',
		maxBuffer: 8 * 1024 * 1024,
	}),
);
const candidate = comparator(readFileSync(file, 'utf8'));

function workload(shape, counted = false) {
	let reads = 0;
	let nextId = 0;
	const nodes = [];
	function add(parent, include = true) {
		const id = nextId++;
		const node = { id, children: [], included: include };
		if (counted) {
			Object.defineProperty(node, 'parentBlock', {
				get() {
					reads++;
					return parent;
				},
			});
		} else node.parentBlock = parent;
		if (parent !== null) parent.children.push(node);
		if (include) nodes.push({ block: node, seq: id, id });
		return node;
	}
	const root = add(null, shape !== 'siblings' && shape !== 'mixed');
	if (shape === 'chain') {
		let parent = root;
		for (let i = 1; i < 400; i++) parent = add(parent);
	} else if (shape === 'siblings') {
		for (let i = 0; i < 1000; i++) add(root);
	} else if (shape === 'mixed') {
		for (let i = 0; i < 150; i++) {
			let parent = add(root);
			for (let depth = 0; depth < i % 6; depth++) parent = add(parent);
		}
	} else if (shape === 'deep-disjoint') {
		// Leaves share only the root. Comparing adjacent entries must reject
		// ancestry even though their immediate parents are many levels apart.
		for (let i = 0; i < 128; i++) {
			let parent = add(root, false);
			for (let depth = 0; depth < 24; depth++) parent = add(parent, false);
			add(parent);
		}
	}
	const expected = [];
	function visit(node) {
		for (const child of node.children) visit(child);
		if (node.included) expected.push(node.id);
	}
	visit(root);
	return {
		nodes,
		expected,
		get reads() {
			return reads;
		},
	};
}

function sorted(comparison, nodes) {
	return nodes.slice().sort((a, b) => comparison(a.block, a.seq, b.block, b.seq));
}

function median(numbers) {
	return numbers.sort((a, b) => a - b)[Math.floor(numbers.length / 2)];
}

function time(comparison, nodes, repeats) {
	const start = performance.now();
	for (let i = 0; i < repeats; i++) sorted(comparison, nodes);
	return ((performance.now() - start) * 1000) / repeats;
}

for (const shape of ['chain', 'siblings', 'mixed', 'deep-disjoint']) {
	const { nodes, expected } = workload(shape);
	assert.deepEqual(
		sorted(baseline, nodes).map((entry) => entry.id),
		expected,
	);
	assert.deepEqual(
		sorted(candidate, nodes).map((entry) => entry.id),
		expected,
	);
	for (const comparison of [baseline, candidate]) {
		// Parent/child and disjoint comparisons must agree even when a sort uses
		// a different comparison sequence after the optimization.
		for (let i = 0; i < nodes.length; i += Math.max(1, Math.floor(nodes.length / 30))) {
			for (let j = 0; j < nodes.length; j += Math.max(1, Math.floor(nodes.length / 30))) {
				const a = nodes[i],
					b = nodes[j];
				assert.equal(
					Math.sign(comparison(a.block, a.seq, b.block, b.seq)),
					Math.sign(baseline(a.block, a.seq, b.block, b.seq)),
				);
			}
		}
	}
	const baseCounted = workload(shape, true);
	const nextCounted = workload(shape, true);
	sorted(baseline, baseCounted.nodes);
	sorted(candidate, nextCounted.nodes);
	const repeats = shape === 'chain' ? 200 : 500;
	for (let i = 0; i < 250; i++) {
		sorted(baseline, nodes);
		sorted(candidate, nodes);
	}
	const a = [],
		b = [];
	for (let i = 0; i < 8; i++) {
		if (i % 2 === 0) {
			a.push(time(baseline, nodes, repeats));
			b.push(time(candidate, nodes, repeats));
		} else {
			b.push(time(candidate, nodes, repeats));
			a.push(time(baseline, nodes, repeats));
		}
	}
	console.log(
		`${shape}: ${nodes.length} effects, parent reads ${baseCounted.reads} → ${nextCounted.reads}; median µs/sort ${median(a).toFixed(2)} → ${median(b).toFixed(2)}`,
	);
}
