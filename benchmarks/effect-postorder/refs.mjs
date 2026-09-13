// Exercise the actual ref-attach drain and postorder comparator without DOM.
// The counted Array subclass observes native sort calls; callback order is
// checked independently of the measurement.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';

process.chdir(path.resolve(import.meta.dirname, '../..'));
const file = 'packages/octane/src/runtime.ts';
const baselineRef = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const measure = process.argv.includes('--measure');

function instantiate(source) {
	const refStart = source.indexOf('function drainRefAttaches():');
	const refEnd = source.indexOf('// Callback replacement', refStart);
	const comparisonStart = source.indexOf('function blockIsAncestorOf(');
	const comparisonEnd = source.indexOf('function finishEffectCommit()', comparisonStart);
	assert.ok(
		refStart >= 0 && refEnd > refStart && comparisonStart >= 0 && comparisonEnd > comparisonStart,
	);
	const code = stripTypeScriptTypes(
		source.slice(comparisonStart, comparisonEnd) + '\n' + source.slice(refStart, refEnd),
	);
	return Function(`"use strict";
		const counts = { sorts: 0 };
		class CountedQueue extends Array {
			sort(compare) { counts.sorts++; return super.sort(compare); }
		}
		class MaximumUpdateDepthError extends Error {}
		let refAttachQueue = new CountedQueue();
		let REF_CALLBACK_DEPTH = 0;
		let NATIVE_READ_DRIVER = null;
		let activityRefState = null;
		const log = [];
		function blockSubtreeDisposed(block) { return block?.disposed === true; }
		function findHiddenActivity() { return null; }
		function attachRef(ref, el) { log.push(ref); }
		function findTryHandler() { return null; }
		function reportCaughtError() { throw new Error('unexpected caught ref error'); }
		function reportUncaughtError() { throw new Error('unexpected uncaught ref error'); }
		${code}
		return { counts, log, enqueue(entries) { refAttachQueue.push(...entries); }, drain: drainRefAttaches };
	`)();
}

function workload(shape) {
	const queued = [];
	let id = 0;
	function add(parent, attach = true) {
		const block = { parentBlock: parent };
		if (attach) queued.push({ block, ref: id++, el: {} });
		return block;
	}
	function addUnowned() {
		return { block: null, ref: id++, el: {} };
	}
	const root = add(
		null,
		shape === 'mixed' || shape === 'unowned-first' || shape === 'unowned-last',
	);
	if (shape === 'siblings') {
		for (let i = 0; i < 1000; i++) add(root);
	} else if (shape === 'single') {
		add(root);
	} else if (shape === 'mixed') {
		add(root);
		const branch = add(root);
		add(branch);
	} else if (shape === 'deep-disjoint') {
		for (let i = 0; i < 128; i++) {
			let parent = add(root, false);
			for (let depth = 0; depth < 24; depth++) parent = add(parent, false);
			add(parent);
		}
	} else if (shape === 'unowned-first') {
		queued.unshift(addUnowned());
		add(root);
	} else if (shape === 'unowned-last') {
		add(root);
		queued.push(addUnowned());
	} else if (shape === 'unowned-only') {
		for (let i = 0; i < 3; i++) queued.push(addUnowned());
	}
	const expected =
		shape === 'mixed'
			? [1, 3, 2, 0]
			: shape === 'unowned-first'
				? [1, 2, 0]
				: shape === 'unowned-last'
					? [1, 0, 2]
					: queued.map((entry) => entry.ref);
	return { queued, expected };
}

function observe(source, shape) {
	const runtime = instantiate(source);
	const { queued, expected } = workload(shape);
	runtime.enqueue(queued);
	runtime.drain();
	assert.deepEqual(runtime.log, expected);
	runtime.drain(); // An empty second commit cannot attach or sort again.
	assert.deepEqual(runtime.log, expected);
	return { entries: queued.length, sorts: runtime.counts.sorts };
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
for (const [label, source] of sources) {
	for (const shape of [
		'single',
		'siblings',
		'mixed',
		'deep-disjoint',
		'unowned-first',
		'unowned-last',
		'unowned-only',
	]) {
		const result = observe(source, shape);
		if (!measure && label === 'candidate' && shape === 'siblings') {
			assert.equal(result.sorts, 0, 'sibling-only refs must drain without sorting');
		}
		console.log(`${label} ${shape}: ${result.entries} refs, ${result.sorts} sorts`);
		if (label === 'candidate') {
			const stat = (value) => deterministicStatForJson(deterministicCount(value));
			targets.push({ name: `ref-${shape}`, ops: { sort_calls: stat(result.sorts) } });
			targets.push({ name: `ref-${shape}-budget`, ops: { sort_calls: stat(1) } });
		}
	}
}
if (process.env.BENCH_JSON)
	writeFileSync(
		process.env.BENCH_JSON,
		JSON.stringify({ suite: 'effect-scheduling', targets }, null, 2) + '\n',
	);
