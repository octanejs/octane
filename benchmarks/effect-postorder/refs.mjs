// Exercise the actual ref-attach drain and postorder comparator without DOM.
// The counted Array subclass observes native sort calls; callback order is
// checked independently of the measurement.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { readClientRuntime, runtimeDeclarations } from '../lib/client-runtime.mjs';
import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';

process.chdir(path.resolve(import.meta.dirname, '../..'));
const file = 'packages/octane/src/runtime.ts';
const baselineRef = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const measure = process.argv.includes('--measure');

function instantiate(source) {
	const refName = source.includes('function drainQueuedRefAttaches():')
		? 'drainQueuedRefAttaches'
		: 'drainRefAttaches';
	const hostOrder = source.includes('function postOrderHostRefs(')
		? ['postOrderHostRefs', 'compareHostRefs', 'refPosition']
		: [];
	const code = stripTypeScriptTypes(
		runtimeDeclarations(source, [
			'blockIsAncestorOf',
			'comparePostOrder',
			'compareEffectPostOrder',
			'compareRefPostOrder',
			...hostOrder,
			refName,
		]),
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
		return { counts, log, enqueue(entries) { refAttachQueue.push(...entries); }, drain: ${refName} };
	`)();
}

function workload(shape) {
	const queued = [];
	const counts = { positions: 0 };
	let id = 0;
	// A host at tree-order index `pre` whose last descendant is at `last`.
	function host(pre, last = pre) {
		return {
			nodeType: 1,
			pre,
			last,
			compareDocumentPosition(other) {
				counts.positions++;
				if (other.pre > pre && other.pre <= last) return 20;
				if (pre > other.pre && pre <= other.last) return 10;
				return other.pre > pre ? 4 : 2;
			},
		};
	}
	function add(parent, attach = true) {
		const block = { parentBlock: parent };
		if (attach) queued.push({ block, ref: id, el: host(id++) });
		return block;
	}
	function addUnowned() {
		return { block: null, ref: id, el: host(id++) };
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
	} else if (shape === 'block-siblings') {
		for (let i = 0; i < 1000; i++) queued.push({ block: root, ref: i, el: host(i) });
	} else if (shape === 'block-nested') {
		// One template: a host around two hosts, then its sibling.
		for (const [pre, last] of [[0, 2], [1], [2], [3]])
			queued.push({ block: root, ref: pre, el: host(pre, last) });
	}
	const expected =
		shape === 'block-nested'
			? [1, 2, 0, 3]
			: shape === 'mixed'
				? [1, 3, 2, 0]
				: shape === 'unowned-first'
					? [1, 2, 0]
					: shape === 'unowned-last'
						? [1, 0, 2]
						: queued.map((entry) => entry.ref);
	return { queued, expected, counts };
}

function observe(source, shape) {
	const runtime = instantiate(source);
	const { queued, expected, counts } = workload(shape);
	runtime.enqueue(queued);
	runtime.drain();
	assert.deepEqual(runtime.log, expected);
	runtime.drain(); // An empty second commit cannot attach or sort again.
	assert.deepEqual(runtime.log, expected);
	return { entries: queued.length, sorts: runtime.counts.sorts, positions: counts.positions };
}

const sources = [['candidate', readClientRuntime(path.resolve(file))]];
if (baselineRef) sources.unshift(['baseline', readClientRuntime(path.resolve(file), baselineRef)]);
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
		'block-siblings',
		'block-nested',
	]) {
		// The baseline attaches the outer host first (octanejs/octane#2296).
		if (label === 'baseline' && shape === 'block-nested') continue;
		const result = observe(source, shape);
		if (!measure && label === 'candidate' && shape === 'siblings') {
			assert.equal(result.sorts, 0, 'sibling-only refs must drain without sorting');
		}
		console.log(
			`${label} ${shape}: ${result.entries} refs, ${result.sorts} sorts, ${result.positions} position compares`,
		);
		if (label === 'candidate') {
			const stat = (value) => deterministicStatForJson(deterministicCount(value));
			targets.push({
				name: `ref-${shape}`,
				ops: { sort_calls: stat(result.sorts), position_compares: stat(result.positions) },
			});
		}
	}
}
if (process.env.BENCH_JSON)
	writeFileSync(
		process.env.BENCH_JSON,
		JSON.stringify({ suite: 'effect-scheduling', targets }, null, 2) + '\n',
	);
