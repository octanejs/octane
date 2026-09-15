// Actual production helper work, with public-runtime integration tested separately.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { COUNTER_GLOBAL, emptyCounters, instrumentJavaScript } from '../hook-memo/instrument.mjs';
import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';

const repo = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const ts = require('typescript');
const { transformSync } = require('esbuild');
const { parseModule, builders } = require('@tsrx/core');
const { print } = require('esrap');
const tsx = require('esrap/languages/tsx').default;
const baseline = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const measureOnly = process.argv.includes('--measure');
const timed = process.argv.includes('--timing');
const names = new Set([
	'withSlot',
	'appendSlotKey',
	'appendHookSlotPath',
	'resolveSlot',
	'resolveHookSlot',
	'invokeManualHook',
	'manualHook',
]);

function extract(mode, ref) {
	const file = `packages/octane/src/${mode === 'client' ? 'runtime.ts' : mode === 'server' ? 'runtime.server.ts' : 'universal-core.ts'}`;
	const source = ref
		? execFileSync('git', ['show', `${ref}:${file}`], {
				cwd: repo,
				encoding: 'utf8',
				maxBuffer: 8e6,
			})
		: readFileSync(path.join(repo, file), 'utf8');
	const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const declarations = ast.statements.filter(
		(node) =>
			(ts.isFunctionDeclaration(node) && names.has(node.name?.text)) ||
			(ts.isVariableStatement(node) &&
				node.declarationList.declarations.some((declaration) =>
					[
						'slotStack',
						'HOOK_SLOT_PATH',
						'NO_SLOT',
						'UNIVERSAL_SLOT_STACK',
						'MANUAL_HOOK_DRIVER',
					].includes(declaration.name.getText(ast)),
				)),
	);
	const cacheFile = 'packages/octane/src/hook-slot-cache.ts';
	const cache = source.includes("from './hook-slot-cache.js'")
		? ref
			? execFileSync('git', ['show', `${ref}:${cacheFile}`], { cwd: repo, encoding: 'utf8' })
			: readFileSync(path.join(repo, cacheFile), 'utf8')
		: '';
	const code = transformSync(
		cache + '\n' + declarations.map((node) => node.getText(ast)).join('\n'),
		{
			loader: 'ts',
			format: 'cjs',
			minifySyntax: true,
			define: { __OCTANE_PROFILE_ENABLED__: 'false', 'process.env.NODE_ENV': '"production"' },
		},
	).code;
	return {
		code,
		hash: createHash('sha256').update(code).digest('hex'),
		source: file,
		sourceHash: createHash('sha256').update(source).digest('hex'),
		cacheHash: cache === '' ? null : createHash('sha256').update(cache).digest('hex'),
	};
}

function instantiate(code, mode) {
	return Function(`'use strict'; const module = { exports: {} };
	 const NATIVE_REFLECT_APPLY = Reflect.apply;
	 const owner = { implicitSlot: 0 };
	 function currentAttempt() { return {}; }
	 function activateLazyLeafOwner() { return owner; }
	 ${code}
	 return { ...module.exports, resolve: ${mode === 'client' ? 'resolveSlot' : 'resolveHookSlot'},
	 inspect: ${
			code.includes('function resolveHookPath')
				? `() => ({
		frames: frames.length,
		entries: frames.reduce((sum, frame) => sum + (frame.slots?.size ?? 0), 0),
		maxEntries: Math.max(0, ...frames.map(frame => frame.slots?.size ?? 0)),
		primitiveKeys: frames.every(frame => frame.slots === null || [...frame.slots.keys()].every(
			key => key === null || (typeof key !== 'object' && typeof key !== 'function')))
	 })`
				: '() => null'
		} };`)();
}

function observe(code) {
	const ast = parseModule(code, 'helpers.mjs');
	const b = builders;
	function visit(node) {
		if (Array.isArray(node)) return node.map(visit);
		if (node === null || typeof node !== 'object' || !node.type) return node;
		let result = { ...node };
		for (const key of Object.keys(node))
			if (!['loc', 'start', 'end', 'metadata', 'comments', 'tokens'].includes(key))
				result[key] = visit(node[key]);
		const isIntern =
			node.type === 'CallExpression' &&
			((node.callee.type === 'MemberExpression' &&
				node.callee.object.name === 'Symbol' &&
				node.callee.property.name === 'for') ||
				node.callee.name === 'intern');
		if (isIntern)
			result = b.sequence([b.update('++', b.member(b.id('globalThis'), '__slotInterns')), result]);
		if (
			(node.type === 'BinaryExpression' && node.operator === '+') ||
			(node.type === 'TemplateLiteral' && node.expressions.length !== 0) ||
			(node.type === 'AssignmentExpression' && node.operator === '+=')
		)
			result = b.sequence([b.update('++', b.member(b.id('globalThis'), '__slotConcats')), result]);
		return result;
	}
	return instrumentJavaScript(
		print(visit(ast), tsx()).code,
		'helpers.mjs',
		'runtime',
		{
			parseModule,
			builders,
			print: (value) => print(value, tsx()).code,
		},
		{ objects: true },
	);
}

function workload(runtime, depth, arity, repeats) {
	const paths = Array.from({ length: depth }, (_, index) => Symbol.for(`custom:path:${index}`));
	const bases = Array.from({ length: 8 }, (_, index) => Symbol.for(`custom:base:${index}`));
	const args = Array.from({ length: arity }, (_, index) => index + 1);
	let checksum = 0;
	function body(...received) {
		assert.equal(this, undefined);
		assert.deepEqual(received, args);
		for (const base of bases) checksum += Symbol.keyFor(runtime.resolve(base)).length;
	}
	function enter(index) {
		if (index === depth) return body(...args);
		if (index === depth - 1) return runtime.withSlot(paths[index], body, ...args);
		return runtime.withSlot(paths[index], enter, index + 1);
	}
	globalThis[COUNTER_GLOBAL] = emptyCounters();
	globalThis.__slotInterns = 0;
	globalThis.__slotConcats = 0;
	for (let index = 0; index < repeats; index++) enter(0);
	return {
		checksum,
		internCalls: globalThis.__slotInterns,
		concatenations: globalThis.__slotConcats,
		...globalThis[COUNTER_GLOBAL],
	};
}

function runPath(runtime, paths, base) {
	function enter(index) {
		return index === paths.length
			? runtime.resolve(base)
			: runtime.withSlot(paths[index], enter, index + 1);
	}
	return enter(0);
}

function expectedKey(mode, parts) {
	return (
		(mode === 'universal' ? '@octane:universal-hook:' : '@octane:hook:') +
		parts
			.map((part) => {
				const text = typeof part === 'symbol' ? (part.description ?? '') : String(part);
				const tag =
					mode === 'universal'
						? typeof part === 'symbol'
							? 's'
							: 'v'
						: typeof part === 'symbol'
							? 's'
							: typeof part === 'number'
								? 'n'
								: 't';
				return tag + text.length + ':' + text;
			})
			.join('')
	);
}

function controls(code, mode) {
	const runtime = instantiate(code, mode);
	const base = Symbol('control:base');
	const paths = [Symbol('same:length:a'), Symbol('inner'), Symbol('deep')];
	const check = (parts, own = base) => {
		const actual = runPath(runtime, parts, own);
		assert.equal(Symbol.keyFor(actual), expectedKey(mode, [...parts, own]));
		return actual;
	};
	const first = check(paths);
	paths[0] = Symbol('same:length:b');
	assert.notEqual(check(paths), first);
	paths[0] = Symbol('same:length:a');
	assert.equal(check(paths), first);
	check([Symbol('n1:1'), Symbol('s3:a:b')], Symbol('\ud800:'));
	check([1, Symbol('1')], 17);
	check([Symbol('1'), 1], 17);
	if (mode === 'server') check(['string:path', 1], 'string:base');

	// Fill every retained depth past its entry limit, then revisit the uncached
	// suffix and over-depth paths. The oracle checks exact symbols, not lengths.
	for (let depth = 1; depth <= 20; depth++) {
		const parts = Array.from({ length: depth }, (_, index) => Symbol(`bounded:${index}`));
		const bases = Array.from({ length: 40 }, (_, index) => Symbol(`bounded-base:${index}`));
		for (let pass = 0; pass < 2; pass++) for (const own of bases) check(parts, own);
	}
	const limits = runtime.inspect();
	if (limits !== null) {
		assert.ok(limits.frames <= 16);
		assert.ok(limits.maxEntries <= 32);
		assert.ok(limits.entries <= 16 * 32);
		assert.equal(limits.primitiveKeys, true);
	}

	const original = Symbol.for;
	const descriptor = Object.getOwnPropertyDescriptor(Symbol, 'for');
	let registryCalls = 0;
	let wrongReceiver = false;
	function replacement(key) {
		registryCalls++;
		wrongReceiver ||= this !== Symbol;
		return original('custom-registry:' + key);
	}
	for (const beforeImport of [false, true])
		for (const proxied of [false, true]) {
			registryCalls = 0;
			wrongReceiver = false;
			let registryRuntime = beforeImport ? null : instantiate(code, mode);
			if (!beforeImport) runPath(registryRuntime, paths, base);
			try {
				Object.defineProperty(Symbol, 'for', {
					...descriptor,
					value: proxied
						? new Proxy(original, {
								apply(_target, receiver, args) {
									return Reflect.apply(replacement, receiver, args);
								},
							})
						: replacement,
				});
				registryRuntime ??= instantiate(code, mode);
				for (let index = 0; index < 3; index++) {
					const actual = runPath(registryRuntime, paths, base);
					assert.equal(
						Symbol.keyFor(actual),
						'custom-registry:' + expectedKey(mode, [...paths, base]),
					);
				}
			} finally {
				Object.defineProperty(Symbol, 'for', descriptor);
			}
			assert.equal(
				registryCalls,
				3,
				`${mode}: registry calls (${beforeImport ? 'before' : 'after'} import, proxy=${proxied})`,
			);
			assert.equal(wrongReceiver, false);
		}

	if (mode === 'universal') {
		let coercions = 0;
		const dynamic = {
			toString() {
				return `value:${coercions++}`;
			},
		};
		const objectBase = {
			toString() {
				return 'object-base';
			},
		};
		for (let index = 0; index < 2; index++) {
			const actual = runPath(runtime, [dynamic], objectBase);
			const length = `value:${index * 2}`.length;
			assert.equal(
				Symbol.keyFor(actual),
				`@octane:universal-hook:v${length}:value:${index * 2 + 1}v11:object-base`,
			);
		}
		assert.equal(coercions, 4);
		assert.equal(runtime.inspect()?.primitiveKeys ?? true, true);
	}
	return { boundedPathResolutions: 1600, customRegistryResolutions: 12, limits };
}

function measure(mode, ref) {
	const { code, ...metadata } = extract(mode, ref);
	const semanticControls = controls(code, mode);
	const clean = instantiate(code, mode);
	globalThis[COUNTER_GLOBAL] = emptyCounters();
	const observed = instantiate(observe(code), mode);
	const initialization = { ...globalThis[COUNTER_GLOBAL] };
	const cases = {};
	for (const depth of [1, 3, 20])
		for (const arity of [0, 1, 4, 7]) {
			const expected = workload(clean, depth, arity, 1000);
			const actual = workload(observed, depth, arity, 1000);
			assert.equal(actual.checksum, expected.checksum);
			cases[`${depth}/${arity}`] = actual;
		}
	const times = [];
	if (timed)
		for (let index = 0; index < 8; index++) {
			const start = performance.now();
			workload(clean, 3, 1, 10000);
			times.push(performance.now() - start);
		}
	return { ...metadata, semanticControls, initialization, cases, times };
}

const result = { node: process.version, v8: process.versions.v8, candidate: {}, baseline: {} };
for (const mode of ['client', 'server', 'universal']) {
	result.candidate[mode] = measure(mode);
	if (baseline) {
		result.baseline[mode] = measure(mode, baseline);
		for (const [name, after] of Object.entries(result.candidate[mode].cases)) {
			const before = result.baseline[mode].cases[name];
			assert.equal(after.checksum, before.checksum);
			console.log(
				`${mode} depth/arity ${name}: intern ${before.internCalls} -> ${after.internCalls}, rest ${before.runtime_restArrays} -> ${after.runtime_restArrays}`,
			);
		}
	}
}
const targets = [];
const stat = (value) => deterministicStatForJson(deterministicCount(value));
for (const [mode, value] of Object.entries(result.candidate)) {
	for (const [label, key] of [
		['cold', '3/0'],
		['warm', '3/1'],
		['overdepth', '20/1'],
	]) {
		const sample = value.cases[key];
		targets.push({
			name: `custom-path-${mode}-${label}`,
			ops: {
				internCalls: stat(sample.internCalls),
				concatenations: stat(sample.concatenations),
				restArrays: stat(sample.runtime_restArrays),
			},
		});
	}
	const limits = value.semanticControls.limits;
	if (limits !== null)
		targets.push({
			name: `custom-path-${mode}-bounds`,
			ops: {
				frames: stat(limits.frames),
				maxEntries: stat(limits.maxEntries),
				retainedEntries: stat(limits.entries),
			},
		});
}
targets.push({
	name: 'custom-path-budget',
	ops: Object.fromEntries(
		['internCalls', 'concatenations', 'restArrays', 'frames', 'maxEntries', 'retainedEntries'].map(
			(name) => [name, stat(1)],
		),
	),
});
const output = {
	suite: 'hooks-runtime',
	targets,
	metadata: { baseline: baseline ?? null, ...result },
};
if (process.env.BENCH_JSON)
	writeFileSync(process.env.BENCH_JSON, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
if (!measureOnly)
	for (const [mode, value] of Object.entries(result.candidate)) {
		assert.ok(
			value.cases['3/1'].internCalls < 8000,
			`${mode}: repeated composed slots reuse registry results`,
		);
		assert.equal(value.cases['3/1'].internCalls, 0, `${mode}: warm registry work`);
		assert.equal(value.cases['3/1'].concatenations, 0, `${mode}: warm serialization work`);
		assert.equal(value.cases['20/1'].internCalls, 8000, `${mode}: overdepth cold fallback`);
	}
delete globalThis[COUNTER_GLOBAL];
delete globalThis.__slotInterns;
delete globalThis.__slotConcats;
