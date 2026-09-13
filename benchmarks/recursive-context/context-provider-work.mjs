// Audit the retained provider lookup against a get-first proposal. Untimed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '../..');
const file = 'packages/octane/src/runtime.ts';
const baselineRef = process.argv[2] ?? '6284156ce';
const source = execFileSync('git', ['show', `${baselineRef}:${file}`], {
	cwd: repo,
	encoding: 'utf8',
	maxBuffer: 8 * 1024 * 1024,
});
function helpers(source) {
	const start = source.indexOf('function cacheContextOwner(');
	const end = source.indexOf('/** @internal Live context reader', start);
	assert.ok(start >= 0 && end > start);
	return source.slice(start, end);
}
const original = helpers(source);
assert.equal(original.split('values !== null && values.has(context)').length - 1, 2);
const getFirst = original
	.replace('let scope: Scope | null = reader;', 'let value: T;\nlet scope: Scope | null = reader;')
	.replaceAll(
		'values !== null && values.has(context)',
		'values !== null && ((value = values.get(context)) !== undefined || values.has(context))',
	)
	.replaceAll('return values.get(context) as T;', 'return value as T;');
function instantiate(source) {
	return Function(`"use strict";
		const DEFAULT_CTX = Symbol();
		let SCOPED_READ_TRACKING = false;
		let SCOPED_READS = null;
		function rendererRegionOwnerForBlock() { return null; }
		${stripTypeScriptTypes(source)}
		return readContextFrom;
	`)();
}
function workload(read, shape) {
	const token = {};
	const context = { defaultValue: 'default', $$version: 0 };
	const otherContext = {};
	let has = 0;
	let get = 0;
	const providerMap = (entries) => {
		const map = new Map(entries);
		map.has = function (key) {
			has++;
			return Map.prototype.has.call(this, key);
		};
		map.get = function (key) {
			get++;
			return Map.prototype.get.call(this, key);
		};
		return map;
	};
	let parent = null;
	let expected = token;
	if (shape === 'default' || shape === 'cached-default') expected = 'default';
	if (shape === 'undefined') expected = undefined;
	if (shape === 'null') expected = null;
	for (let i = 0; i < 32; i++) {
		let values = null;
		if (shape !== 'hit' && shape !== 'cached-hit') values = providerMap([[otherContext, i]]);
		if (i === 0 && shape !== 'default' && shape !== 'cached-default')
			values = providerMap([[context, shape === 'undefined' ? token : expected]]);
		// A nearest explicit undefined must shadow the non-undefined outer provider.
		if (shape === 'undefined' && i === 31) values = providerMap([[context, undefined]]);
		parent = {
			parent,
			parentBlock: parent,
			$$ctxValues: values,
			$$ctxCache: null,
			$$ctxCacheOwner: null,
		};
	}
	assert.equal(read(parent, parent, context), expected);
	if (shape.startsWith('cached-')) {
		has = 0;
		get = 0;
		assert.equal(read(parent, parent, context), expected);
	}
	return { has, get, probes: has + get };
}
const results = {};
for (const [name, code] of [
	['baseline', original],
	['getFirstProposal', getFirst],
	['candidate', helpers(readFileSync(path.join(repo, file), 'utf8'))],
]) {
	const read = instantiate(code);
	results[name] = Object.fromEntries(
		[
			'hit',
			'deep-other-providers',
			'default',
			'undefined',
			'null',
			'cached-hit',
			'cached-default',
		].map((shape) => [shape, workload(read, shape)]),
	);
}
assert.deepEqual(
	results.candidate,
	results.baseline,
	'retained provider lookup has no hidden cost transfer',
);
console.log(
	JSON.stringify(
		{
			node: process.version,
			v8: process.versions.v8,
			baselineRef,
			metric: 'provider Map probes per context lookup',
			results,
		},
		null,
		2,
	),
);
