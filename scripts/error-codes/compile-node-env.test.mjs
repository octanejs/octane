import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { transform } from 'esbuild';
import {
	compileNodeEnvReads,
	DEVELOPMENT_FLAG,
	DEVELOPMENT_FLAG_DECLARATION,
} from '../../packages/octane/scripts/compile-node-env.mjs';
import { specializeErrorCalls } from '../../packages/octane/scripts/specialize-error-calls.mjs';
import { formatProdErrorMessage } from '../../packages/octane/src/error-message.ts';

const catalog = JSON.parse(
	readFileSync(new URL('../../packages/octane/error-codes/codes.json', import.meta.url), 'utf8'),
);

async function evaluate(source, env) {
	const compiled = await transform(source, { loader: 'ts', format: 'cjs', target: 'esnext' });
	const module = { exports: {} };
	const context = vm.createContext({ module, exports: module.exports, process: { env } });
	vm.runInContext(compiled.code, context);
	return { exports: module.exports, context };
}

test('every comparison form becomes the flag, read once while the module evaluates', async () => {
	const source = `'use client';
declare const process: { env: { NODE_ENV?: string } };
import { value } from './value.js';
export const forms = () => [
	process.env.NODE_ENV !== 'production',
	process.env.NODE_ENV === 'production',
	'production' != process.env.NODE_ENV,
	'production' == process.env.NODE_ENV,
	process.env.NODE_ENV !== \`production\`,
];
export function dev() {
	if (process.env.NODE_ENV !== 'production') return 'development';
	return value;
}`;
	const compiled = compileNodeEnvReads(source, 'module.ts');
	assert.equal(compiled.split('process.env.NODE_ENV').length - 1, 1);
	assert.match(compiled, /^'use client';\nconst __octaneDev = /);
	assert.ok(compiled.includes(DEVELOPMENT_FLAG_DECLARATION));

	const runnable = compiled.replace("import { value } from './value.js';", "const value = 'p';");
	for (const [mode, development] of [
		[undefined, true],
		['development', true],
		['test', true],
		['production', false],
	]) {
		const { exports, context } = await evaluate(
			runnable,
			mode === undefined ? {} : { NODE_ENV: mode },
		);
		const expected = [development, !development, development, !development, development];
		assert.deepEqual([...exports.forms()], expected, String(mode));
		// Later environment changes, including losing the process global, cannot
		// change or break a module that has already evaluated.
		context.process.env.NODE_ENV = development ? 'production' : 'development';
		assert.deepEqual([...exports.forms()], expected, String(mode));
		delete context.process;
		assert.deepEqual([...exports.forms()], expected, String(mode));
		assert.equal(exports.dev(), development ? 'development' : 'p');
	}
});

test('specialized errors keep their messages without process after evaluation', async () => {
	const source = `import { formatClientError } from './error-codes.client.generated.js';
export function fail() { throw new TypeError(formatClientError(313)); }`;
	const compiled = compileNodeEnvReads(
		specializeErrorCalls(source, 'dom-bindings.ts', catalog),
		'dom-bindings.ts',
	);
	for (const mode of ['development', 'production']) {
		const { exports, context } = await evaluate(compiled, { NODE_ENV: mode });
		delete context.process;
		assert.throws(exports.fail, {
			name: 'TypeError',
			message:
				mode === 'production' ? formatProdErrorMessage(313, []) : catalog.codes['313'].message,
		});
	}
});

test('annotations stay attached to the statement they precede', () => {
	const source = `/* @__NO_SIDE_EFFECTS__ */ export function make() {
	return process.env.NODE_ENV === 'production' ? 1 : 2;
}`;
	const compiled = compileNodeEnvReads(source, 'module.ts');
	assert.ok(
		compiled.startsWith(`${DEVELOPMENT_FLAG_DECLARATION}\n/* @__NO_SIDE_EFFECTS__ */ export`),
	);
	assert.match(compiled, /return !__octaneDev \? 1 : 2;/);
});

test('the compiled flag still takes a bundler substitution', async () => {
	// esbuild folds the flag only in modules without imports; see compile-node-env.mjs.
	const source = compileNodeEnvReads(
		`export function f() { return process.env.NODE_ENV !== 'production' ? 'DEVELOPMENT ONLY' : 'p'; }`,
		'module.ts',
	);
	for (const [mode, retained] of [
		['production', false],
		['development', true],
	]) {
		const { code } = await transform(source, {
			loader: 'ts',
			format: 'esm',
			minify: true,
			define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
		});
		assert.equal(code.includes('DEVELOPMENT ONLY'), retained, mode);
		assert.doesNotMatch(code, /process/);
	}
});

test('modules without environment reads are returned unchanged', () => {
	for (const source of [
		'export const a = 1;',
		"const NODE_ENV_NOTE = 'mentions NODE_ENV only in text';",
		'declare const process: { env: { NODE_ENV?: string } };\nexport type T = { NODE_ENV: string };',
	]) {
		assert.equal(compileNodeEnvReads(source, 'module.ts'), source);
	}
});

test('reads it cannot compile fail the build instead of shipping a live lookup', () => {
	for (const [source, reason] of [
		["process.env.NODE_ENV === 'development';", /compare process\.env\.NODE_ENV directly/],
		['const mode = process.env.NODE_ENV;', /compare process\.env\.NODE_ENV directly/],
		['const { NODE_ENV } = process.env;', /compare process\.env\.NODE_ENV directly/],
		["process?.env.NODE_ENV === 'production';", /compare process\.env\.NODE_ENV directly/],
		["const env = process.env; env.NODE_ENV === 'production';", /compare process\.env\.NODE_ENV/],
		["typeof process.env.NODE_ENV === 'production';", /compare process\.env\.NODE_ENV directly/],
		["process.env['NODE_ENV'] === 'production';", /read NODE_ENV as process\.env\.NODE_ENV/],
		[
			"function f(process) { return process.env.NODE_ENV === 'production'; }",
			/cannot declare its own process/,
		],
		[
			"import process from 'node:process'; process.env.NODE_ENV === 'production';",
			/cannot declare its own process/,
		],
		["const __octaneDev = 1; process.env.NODE_ENV === 'production';", /__octaneDev is reserved/],
	]) {
		assert.throws(() => compileNodeEnvReads(source, 'module.ts'), reason, source);
	}
});
