// Untimed source-work guard over the actual active warm-plan helpers.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { COUNTER_GLOBAL, emptyCounters, instrumentJavaScript } from '../hook-memo/instrument.mjs';
import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';

const repo = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const ts = require('typescript');
const { transformSync } = require('esbuild');
const { parseModule, builders } = require('@tsrx/core');
const { print } = require('esrap');
const tsx = require('esrap/languages/tsx').default;
const file = 'packages/octane/src/runtime.ts';
const baselineRef = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const measureOnly = process.argv.includes('--measure');
const hash = (source) => createHash('sha256').update(source).digest('hex');

function helpers(source) {
	const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const names = new Set(['runWarm', 'blockIsAncestor', 'runActiveWarmPlans']);
	const functions = ast.statements.filter(
		(node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text),
	);
	assert.ok(functions.some((node) => node.name.text === 'runActiveWarmPlans'));
	return transformSync(functions.map((node) => node.getText(ast)).join('\n'), {
		loader: 'ts',
		define: { 'process.env.NODE_ENV': '"production"' },
		minifySyntax: true,
	}).code;
}

function instantiate(code) {
	return Function(`"use strict";
		let CURRENT_BLOCK = null;
		const ACTIVE_WARM_PLANS = [];
		const initialCache = new Map();
		const initialClaims = new Set();
		let CURRENT_WARM = initialCache;
		let CURRENT_WARM_CLAIMS = initialClaims;
		let WARM_EVER = false;
		const caches = new Map();
		const owners = [];
		function warmCacheForOwner(owner) {
			owners.push(owner.id);
			let cache = caches.get(owner);
			if (cache === undefined) caches.set(owner, cache = new Map());
			return cache;
		}
		${code}
		return {
			run: runActiveWarmPlans,
			owners,
			enter(block, plans, fn) {
				const previous = CURRENT_BLOCK;
				const length = ACTIVE_WARM_PLANS.length;
				CURRENT_BLOCK = block;
				ACTIVE_WARM_PLANS.push(...plans);
				try { return fn(); }
				finally { CURRENT_BLOCK = previous; ACTIVE_WARM_PLANS.length = length; }
			},
			claim(token) {
				const had = CURRENT_WARM_CLAIMS.has(token);
				CURRENT_WARM_CLAIMS.add(token);
				return had;
			},
			restored() { return CURRENT_WARM === initialCache && CURRENT_WARM_CLAIMS === initialClaims; }
		};
	`)();
}

function exercise(code, shape) {
	const runtime = instantiate(code);
	const root = { id: 'root', parentBlock: null };
	const child = { id: 'child', parentBlock: root };
	const nested = { id: 'nested', parentBlock: null };
	const foreign = { id: 'foreign', parentBlock: null };
	const token = {};
	const log = [];
	const plans = [];
	const planCount = shape === 'empty' || shape === 'local' ? 0 : shape === 'wide' ? 8 : 2;
	for (let i = 0; i < planCount; i++) {
		plans.push(
			root,
			() => {
				log.push([`plan${i}`, runtime.claim(token)]);
				if (shape === 'reentrant' && i === 0) {
					runtime.enter(
						nested,
						[nested, () => log.push(['nested', runtime.claim(token)]), null],
						() => runtime.run(),
					);
					assert.equal(runtime.claim(token), true, 'outer claims survive the nested render');
				}
				if (shape === 'throwing' && i === 0) throw new Error('speculative plan');
			},
			null,
		);
	}
	// An independent render can leave unrelated registrations on the active stack.
	plans.unshift(
		foreign,
		() => {
			log.push(['unrelated', runtime.claim(token)]);
		},
		null,
	);
	const local = shape === 'empty' ? undefined : () => log.push(['local', runtime.claim(token)]);
	runtime.enter(child, plans, () => runtime.run(local));
	const expected = Array.from({ length: planCount }, (_, i) => [`plan${i}`, false]);
	if (shape === 'reentrant') expected.splice(1, 0, ['nested', false]);
	if (local !== undefined) expected.push(['local', false]);
	assert.deepEqual(log, expected);
	assert.deepEqual(
		runtime.owners,
		shape === 'empty'
			? []
			: shape === 'reentrant'
				? ['root', 'nested']
				: [planCount ? 'root' : 'child'],
	);
	assert.equal(runtime.restored(), true);
	return log;
}

function measure(source) {
	const clean = helpers(source);
	const observed = instrumentJavaScript(
		clean,
		file,
		'runtime',
		{
			parseModule,
			builders,
			print: (ast) => print(ast, tsx()).code,
		},
		{ objects: true },
	);
	const cases = {};
	for (const shape of ['empty', 'local', 'wide', 'throwing', 'reentrant']) {
		const expected = exercise(clean, shape);
		globalThis[COUNTER_GLOBAL] = emptyCounters();
		assert.deepEqual(exercise(observed, shape), expected);
		const counters = globalThis[COUNTER_GLOBAL];
		cases[shape] = {
			arrays: counters.runtime_arrayLiterals,
			functions: counters.runtime_functions,
			constructors: counters.runtime_constructors,
		};
	}
	delete globalThis[COUNTER_GLOBAL];
	return { sourceHash: hash(source), helperHash: hash(clean), cases };
}

const candidate = measure(readFileSync(path.join(repo, file), 'utf8'));
const baseline = baselineRef
	? measure(
			execFileSync('git', ['show', `${baselineRef}:${file}`], {
				cwd: repo,
				encoding: 'utf8',
				maxBuffer: 8 * 1024 * 1024,
			}),
		)
	: undefined;
console.log(
	JSON.stringify(
		{ node: process.version, v8: process.versions.v8, baselineRef, baseline, candidate },
		null,
		2,
	),
);
const targets = [];
const stat = (value) => deterministicStatForJson(deterministicCount(value));
for (const [shape, counts] of Object.entries(candidate.cases)) {
	const constructors =
		shape === 'empty'
			? 0
			: shape === 'local'
				? 1
				: shape === 'wide'
					? 9
					: shape === 'reentrant'
						? 4
						: 3;
	if (!measureOnly) {
		assert.equal(counts.arrays, 0, `${shape}: no selected-plan array`);
		assert.equal(counts.functions, 0, `${shape}: no activation wrapper`);
		assert.equal(
			counts.constructors,
			constructors,
			`${shape}: one occurrence-claim Set per invoked plan`,
		);
	}
	targets.push({
		name: `warm-${shape}`,
		ops: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, stat(value)])),
	});
	targets.push({
		name: `warm-${shape}-budget`,
		ops: { arrays: stat(1), functions: stat(1), constructors: stat(Math.max(1, constructors)) },
	});
}
if (process.env.BENCH_JSON)
	writeFileSync(
		process.env.BENCH_JSON,
		JSON.stringify({ suite: 'hooks-runtime', targets }, null, 2) + '\n',
	);
