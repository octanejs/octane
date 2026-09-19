// Isolate the actual scheduler sort with deterministic work and semantic controls.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { performance } from 'node:perf_hooks';
import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';
import path from 'node:path';

process.chdir(path.resolve(import.meta.dirname, '../..'));
const shapes = ['chain', 'siblings', 'sparse', 'mixed', 'lite'];

const file = 'packages/octane/src/runtime.ts';
const baselineRef = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const measure = process.argv.includes('--measure');
function instantiate(source, counted = true) {
	const start = source.indexOf('function sortWaveByDepth(');
	const end = source.indexOf('// Visibility-owner scheduling', start);
	assert.ok(start >= 0 && end > start);
	const code = stripTypeScriptTypes(source.slice(start, end));
	const counts = { maps: 0, sets: 0 };
	const run = Function(
		'Map',
		'Set',
		`${code}\nreturn sortWaveByDepth;`,
	)(
		counted
			? class extends Map {
					constructor(...args) {
						super(...args);
						counts.maps++;
					}
				}
			: Map,
		counted
			? class extends Set {
					constructor(...args) {
						super(...args);
						counts.sets++;
					}
				}
			: Set,
	);
	return { run, counts };
}
function workload(shape, counted) {
	let reads = 0;
	const nodes = [];
	const wave = [];
	function add(parent, queued = true) {
		const block = { id: nodes.length, drainStamp: 7, drainRenders: 19 };
		if (counted)
			Object.defineProperty(block, 'parentBlock', {
				get() {
					reads++;
					return parent;
				},
			});
		else block.parentBlock = parent;
		nodes.push({ block, depth: parent === null ? 0 : nodes[parent.id].depth + 1 });
		if (queued) wave.push(block);
		return block;
	}
	const root = add(null, shape === 'chain');
	if (shape === 'chain') {
		let parent = root;
		for (let i = 1; i < 400; i++) parent = add(parent);
		wave.reverse();
	} else if (shape === 'siblings') {
		for (let i = 0; i < 1000; i++) add(root);
	} else if (shape === 'sparse' || shape === 'lite') {
		let parent = root;
		for (let i = 0; i < 40; i++) {
			parent = add(parent, false);
			if (shape === 'lite' && i % 2 === 0) {
				delete parent.drainStamp;
				delete parent.drainRenders;
			}
		}
		for (let i = 0; i < 1000; i++) add(parent);
	} else {
		for (let i = 0; i < 100; i++) {
			let parent = i % 2 ? root : add(null, false);
			for (let j = 0; j < i % 12; j++) parent = add(parent, j % 3 === 0);
			add(parent);
		}
		wave.reverse();
	}
	const expected = wave
		.slice()
		.sort((a, b) => nodes[a.id].depth - nodes[b.id].depth)
		.map((b) => b.id);
	return {
		wave,
		expected,
		lite: nodes.filter(({ block }) => block.drainStamp === undefined).map(({ block }) => block),
		get reads() {
			return reads;
		},
	};
}
const sources = [['candidate', readFileSync(file, 'utf8')]];
if (baselineRef)
	sources.unshift([
		'baseline',
		execFileSync('git', ['show', `${baselineRef}:${file}`], {
			encoding: 'utf8',
			maxBuffer: 8 * 1024 * 1024,
		}),
	]);
const targets = [];
for (const [target, source] of sources) {
	const metrics = {};
	for (const shape of shapes) {
		const runtime = instantiate(source);
		const sample = workload(shape, true);
		assert.equal(runtime.run(sample.wave, 8), sample.wave);
		assert.deepEqual(
			sample.wave.map((b) => b.id),
			sample.expected,
		);
		for (const lite of sample.lite) {
			assert.equal('drainStamp' in lite, false);
			assert.equal('drainRenders' in lite, false);
		}
		metrics[`${shape}_collections`] = runtime.counts.maps + runtime.counts.sets;
		metrics[`${shape}_parent_reads`] = sample.reads;
		// Repeat with a fresh epoch after changing ancestry: cached depths must expire.
		const moved = workload(shape, false);
		runtime.run(moved.wave, 9);
		moved.wave.reverse();
		for (const block of moved.wave) block.parentBlock = null;
		const stable = moved.wave.slice();
		runtime.run(moved.wave, 10);
		assert.deepEqual(moved.wave, stable);
		if (!measure && target === 'candidate') {
			assert.equal(metrics[`${shape}_collections`], 0);
			assert.ok(
				sample.reads <= (shape === 'mixed' ? 2400 : 2200),
				`${shape}: ancestry work bounded`,
			);
		}
		const timed = workload(shape, false);
		const timedRuntime = instantiate(source, false);
		for (let i = 1; i <= 100; i++) {
			timed.wave.reverse();
			timedRuntime.run(timed.wave, i + 100);
		}
		const batches = [];
		for (let batch = 0; batch < 8; batch++) {
			const start = performance.now();
			for (let i = 0; i < 100; i++) {
				timed.wave.reverse();
				timedRuntime.run(timed.wave, 300 + batch * 100 + i);
			}
			batches.push((performance.now() - start) * 10);
		}
		batches.sort((a, b) => a - b);
		console.log(
			JSON.stringify({
				target,
				shape,
				collections: metrics[`${shape}_collections`],
				parentReads: sample.reads,
				medianUs: batches[4],
				minUs: batches[0],
				maxUs: batches[7],
			}),
		);
	}
	if (target === 'candidate') {
		const stat = (value) => deterministicStatForJson(deterministicCount(value));
		for (const shape of shapes) {
			targets.push({
				name: shape,
				ops: {
					collections: stat(metrics[`${shape}_collections`]),
					parent_reads: stat(metrics[`${shape}_parent_reads`]),
				},
			});
			targets.push({
				name: `${shape}-budget`,
				ops: { collections: stat(1), parent_reads: stat(shape === 'mixed' ? 2400 : 2200) },
			});
		}
	}
}
if (process.env.BENCH_JSON)
	writeFileSync(
		process.env.BENCH_JSON,
		JSON.stringify({ suite: 'effect-scheduling', targets }, null, 2) + '\n',
	);
