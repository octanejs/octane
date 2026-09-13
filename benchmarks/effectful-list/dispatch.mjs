// Untimed work guard for the actual production effect-dispatch helper. Runtime
// source is extracted by AST; fixture callbacks and observer work are excluded.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { COUNTER_GLOBAL, emptyCounters, instrumentJavaScript } from '../hook-memo/instrument.mjs';

const repo = path.resolve(import.meta.dirname, '../..');
const requireDependencies = createRequire(
	path.join(process.env.OCTANE_EFFECT_EXTERNAL_ROOT || repo, 'packages/octane/package.json'),
);
const ts = requireDependencies('typescript');
const { transformSync } = requireDependencies('esbuild');
const { parseModule, builders } = requireDependencies('@tsrx/core');
const { print: printAst } = requireDependencies('esrap');
const tsx = requireDependencies('esrap/languages/tsx').default;
const file = 'packages/octane/src/runtime.ts';
const measureOnly = process.argv.includes('--measure');
const baselineRef = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const count = 1000;
const sha256 = (source) => createHash('sha256').update(source).digest('hex');

function productionHelper(source) {
	const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const helpers = ast.statements.filter(
		(node) =>
			ts.isFunctionDeclaration(node) &&
			['fireEffectCleanup', 'runEffectBody'].includes(node.name?.text),
	);
	assert.equal(helpers.length, 2, 'effect cleanup/body dispatch helpers are present');
	return transformSync(helpers.map((helper) => helper.getText(ast)).join('\n'), {
		loader: 'ts',
		define: { 'process.env.NODE_ENV': '"production"' },
		minifySyntax: true,
	}).code;
}

function instantiate(code) {
	// These collaborators form the helper boundary. Full scheduling, cleanup
	// ordering, rendering, and error-boundary behavior belong to the runtime
	// suites and the existing effectful-list browser benchmark.
	return Function(`"use strict";
		let CURRENT_EFFECT_PHASE = -1;
		let EFFECT_BODY_DEPTH = 0;
		const errors = [];
		class MaximumUpdateDepthError extends Error {}
		function nativeEffectPublicationCurrent(entry) { return entry.current !== false; }
		function reportEffectError(block, error) { errors.push({ block, error }); }
		function runEffectCleanupCallback(cleanup) { cleanup(); }
		${code}
		return { run: runEffectBody, clean: fireEffectCleanup, errors, MaximumUpdateDepthError,
			phase: () => CURRENT_EFFECT_PHASE, depth: () => EFFECT_BODY_DEPTH };
	`)();
}

function workload(code, argsKind) {
	const runtime = instantiate(code);
	const snapshot = { calls: 0, cleanups: 0, argumentValues: 0, hookMapReads: 0 };
	const token = {};
	for (let phase = 0; phase < 3; phase++) {
		for (let index = 0; index < count; index++) {
			const args =
				argsKind === 'omitted' ? undefined : argsKind === 'empty' ? [] : [index, token, undefined];
			const slotKey = Symbol();
			const slot = { slot: slotKey, order: 0, revision: 1, cleanup: undefined };
			const hooks = new Map([[slotKey, slot]]);
			const read = hooks.get;
			hooks.get = function (key) {
				snapshot.hookMapReads++;
				return read.call(this, key);
			};
			const scope = { block: {}, hooks, effectSlots: [slot] };
			const cleanup = () => snapshot.cleanups++;
			function body() {
				assert.equal(this, null);
				assert.equal(runtime.phase(), phase);
				assert.equal(runtime.depth(), 1);
				if (argsKind === 'values') {
					assert.equal(arguments.length, 3);
					assert.equal(arguments[0], index);
					assert.equal(arguments[1], token);
					assert.equal(arguments[2], undefined);
					snapshot.argumentValues += arguments[0];
				} else assert.equal(arguments.length, 0);
				snapshot.calls++;
				return cleanup;
			}
			const entry = { fn: body, args, slot: slotKey, order: 0, revision: 1, scope, phase };
			runtime.clean(entry);
			runtime.run(entry);
			assert.equal(runtime.phase(), -1);
			assert.equal(runtime.depth(), 0);
			assert.equal(slot.cleanup, cleanup);
			runtime.clean(entry);
			assert.equal(slot.cleanup, undefined);
			// Stale revisions, disconnected bodies, and superseded publications
			// must neither invoke a callback nor create its argument fallback.
			runtime.run({ ...entry, revision: 0 });
			runtime.clean({ ...entry, revision: 0 });
			runtime.run({ ...entry, fn: null });
			runtime.run({ ...entry, current: false });
			runtime.clean({ ...entry, current: false });
		}
	}
	assert.equal(snapshot.calls, count * 3);
	assert.equal(snapshot.cleanups, count * 3);
	assert.equal(runtime.errors.length, 0);
	assert.equal(snapshot.argumentValues, argsKind === 'values' ? (count * (count - 1) * 3) / 2 : 0);
	return snapshot;
}

function membershipControls(code) {
	const runtime = instantiate(code);
	const key = Symbol();
	let calls = 0;
	let cleanups = 0;
	const slot = {
		slot: key,
		order: 0,
		revision: 1,
		cleanup() {
			cleanups++;
		},
	};
	const scope = { block: {}, hooks: new Map([[key, slot]]), effectSlots: [slot] };
	const entry = {
		scope,
		slot: key,
		order: 0,
		revision: 1,
		phase: 2,
		fn() {
			calls++;
		},
	};
	// A retained declaration list is not proof of current hook membership.
	// Rollback/remount can remove a slot; same-scope body reuse can replace its
	// Map entry. No old callback or cleanup may survive either invalidation.
	for (const hooks of [null, new Map(), new Map([[key, { deps: [], value: 'replacement' }]])]) {
		scope.hooks = hooks;
		runtime.clean(entry);
		runtime.run(entry);
		assert.equal(calls, 0);
		assert.equal(cleanups, 0);
	}
	scope.hooks = new Map([[key, slot]]);
	slot.cleanup = () => {
		cleanups++;
		// User cleanup can revoke membership before the corresponding body pass.
		scope.hooks.delete(key);
	};
	runtime.clean(entry);
	runtime.run(entry);
	assert.equal(cleanups, 1);
	assert.equal(calls, 0);
	assert.equal(runtime.errors.length, 0);
}

function errorControls(code) {
	const runtime = instantiate(code);
	const slotKey = Symbol();
	const slot = { slot: slotKey, order: 0, revision: 1 };
	const block = {};
	const entry = {
		args: undefined,
		phase: 2,
		revision: 1,
		slot: slotKey,
		order: 0,
		scope: { block, hooks: new Map([[slotKey, slot]]), effectSlots: [slot] },
	};
	const error = new Error('effect failure');
	runtime.run({
		...entry,
		fn() {
			throw error;
		},
	});
	assert.deepEqual(runtime.errors, [{ block, error }]);
	assert.equal(slot.cleanup, undefined);
	assert.equal(runtime.phase(), -1);
	assert.equal(runtime.depth(), 0);
	const depthError = new runtime.MaximumUpdateDepthError();
	assert.throws(
		() =>
			runtime.run({
				...entry,
				fn() {
					throw depthError;
				},
			}),
		(actual) => actual === depthError,
	);
	assert.equal(runtime.phase(), -1);
	assert.equal(runtime.depth(), 0);
}

function measure(source) {
	const clean = productionHelper(source);
	const observed = instrumentJavaScript(clean, file, 'runtime', {
		parseModule,
		builders,
		print: (ast) => printAst(ast, tsx()).code,
	});
	const cases = {};
	for (const name of ['omitted', 'empty', 'values']) {
		const expected = workload(clean, name);
		globalThis[COUNTER_GLOBAL] = emptyCounters();
		assert.deepEqual(workload(observed, name), expected, 'observer preserves callback behavior');
		cases[name] = {
			...expected,
			emptyArrayCreations: globalThis[COUNTER_GLOBAL].runtime_arrayLiterals,
		};
	}
	errorControls(clean);
	errorControls(observed);
	membershipControls(clean);
	membershipControls(observed);
	delete globalThis[COUNTER_GLOBAL];
	return { sourceHash: sha256(source), helperHash: sha256(clean), cases };
}

const result = {
	suite: 'effect-dispatch',
	metric: 'source array-literal creations and hook Map reads in production effect dispatch',
	node: process.version,
	v8: process.versions.v8,
	effectsPerCase: count * 3,
	candidate: measure(readFileSync(path.join(repo, file), 'utf8')),
};
if (baselineRef) {
	result.baselineRef = baselineRef;
	result.baseline = measure(
		execFileSync('git', ['show', `${baselineRef}:${file}`], {
			cwd: repo,
			encoding: 'utf8',
			maxBuffer: 8 * 1024 * 1024,
		}),
	);
	for (const name of ['omitted', 'empty', 'values']) {
		const {
			emptyArrayCreations: before,
			hookMapReads: beforeReads,
			...beforeBehavior
		} = result.baseline.cases[name];
		const {
			emptyArrayCreations: after,
			hookMapReads: afterReads,
			...afterBehavior
		} = result.candidate.cases[name];
		assert.deepEqual(afterBehavior, beforeBehavior);
		console.log(
			`${name}: ${result.effectsPerCase} effects; array creations ${before} → ${after}; hook Map reads ${beforeReads} → ${afterReads}`,
		);
	}
} else console.log(JSON.stringify(result.candidate.cases, null, 2));
if (process.env.BENCH_JSON)
	writeFileSync(process.env.BENCH_JSON, JSON.stringify(result, null, 2) + '\n');
if (!measureOnly) {
	for (const [name, scenario] of Object.entries(result.candidate.cases)) {
		assert.equal(
			scenario.emptyArrayCreations,
			0,
			`${name}: dispatch must not create argument arrays`,
		);
		assert.ok(
			scenario.hookMapReads <= count * 3 * 7,
			`${name}: at most one hook Map read per nonempty cleanup/body attempt`,
		);
	}
}
