import assert from 'node:assert/strict';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { concretePublicSpecifiers, inspectPublicExports } from './public-exports.mjs';

function createPackage(name, exports, files, scripts) {
	const packageDirectory = mkdtempSync(path.join(tmpdir(), 'react-port-public-exports-'));
	for (const [relativePath, source] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(packageDirectory, relativePath)), { recursive: true });
		writeFileSync(path.join(packageDirectory, relativePath), source);
	}
	writeFileSync(
		path.join(packageDirectory, 'package.json'),
		JSON.stringify({ name, exports, scripts }),
	);
	return packageDirectory;
}

test('validates every target in an export fallback array', () => {
	const packageDirectory = mkdtempSync(path.join(tmpdir(), 'react-port-public-exports-'));
	mkdirSync(path.join(packageDirectory, 'src'));
	writeFileSync(path.join(packageDirectory, 'src/index.js'), 'export const primary = true;\n');
	writeFileSync(path.join(packageDirectory, 'src/fallback.js'), 'export const fallback = true;\n');
	writeFileSync(
		path.join(packageDirectory, 'package.json'),
		JSON.stringify({
			name: '@octanejs/export-array-fixture',
			exports: {
				'.': ['./src/index.js', './src/fallback.js'],
			},
		}),
	);

	const report = inspectPublicExports(packageDirectory);

	assert.deepEqual(
		report.targets.map(({ keyPath, target }) => ({ keyPath, target })),
		[
			{ keyPath: 'exports..[0]', target: './src/index.js' },
			{ keyPath: 'exports..[1]', target: './src/fallback.js' },
		],
	);
});

test('rejects an existing target that exports no public values or types', () => {
	const packageDirectory = mkdtempSync(path.join(tmpdir(), 'react-port-public-exports-empty-'));
	mkdirSync(path.join(packageDirectory, 'src'));
	writeFileSync(path.join(packageDirectory, 'src/index.ts'), 'export {};\n');
	writeFileSync(
		path.join(packageDirectory, 'package.json'),
		JSON.stringify({
			name: '@octanejs/empty-export-fixture',
			exports: { '.': './src/index.ts' },
		}),
	);

	assert.throws(() => inspectPublicExports(packageDirectory), /no public contract/i);
});

test('rejects an empty local re-export chain', () => {
	const packageDirectory = createPackage(
		'@octanejs/empty-reexport-fixture',
		{ '.': './src/index.ts' },
		{
			'src/index.ts': "export * from './empty.js';\n",
			'src/empty.ts': 'export {};\n',
		},
	);

	assert.throws(() => inspectPublicExports(packageDirectory), /no public contract/i);
});

test('expands wildcard exports into concrete public specifiers', () => {
	const packageDirectory = createPackage(
		'@octanejs/wildcard-fixture',
		{ '.': './src/index.ts', './features/*': './src/features/*.ts' },
		{
			'src/index.ts': 'export const root = true;\n',
			'src/features/alpha.ts': 'export const alpha = true;\n',
			'src/features/beta.ts': 'export const beta = true;\n',
		},
	);

	assert.deepEqual(concretePublicSpecifiers(packageDirectory, '@octanejs/wildcard-fixture'), [
		'@octanejs/wildcard-fixture',
		'@octanejs/wildcard-fixture/features/alpha',
		'@octanejs/wildcard-fixture/features/beta',
	]);
});

test('accepts CommonJS, side-effect, and intentionally empty type-only declaration contracts', () => {
	const commonjs = createPackage(
		'@octanejs/commonjs-fixture',
		{ '.': './index.cjs' },
		{ 'index.cjs': 'module.exports = { ready: true };\n' },
	);
	const sideEffect = createPackage(
		'@octanejs/side-effect-fixture',
		{ '.': './register.js' },
		{ 'register.js': "import './setup.js';\n", 'setup.js': 'globalThis.fixtureReady = true;\n' },
	);
	const declaration = createPackage(
		'@octanejs/declaration-fixture',
		{ '.': { types: './index.d.ts' } },
		{ 'index.d.ts': 'export {};\n' },
	);

	assert.equal(inspectPublicExports(commonjs).status, 'passed');
	assert.equal(inspectPublicExports(sideEffect).status, 'passed');
	assert.equal(inspectPublicExports(declaration).status, 'passed');
});

test('rejects an empty runtime condition even when its declaration condition is nonempty', () => {
	const packageDirectory = createPackage(
		'@octanejs/empty-runtime-condition-fixture',
		{ '.': { types: './index.d.ts', import: './index.js' } },
		{ 'index.d.ts': 'export declare const ready: true;\n', 'index.js': 'export {};\n' },
	);

	assert.throws(() => inspectPublicExports(packageDirectory), /runtime export condition.*import/i);
});

test('requires an explicit source marker for an intentionally empty runtime condition', () => {
	const packageDirectory = createPackage(
		'@octanejs/empty-runtime-marker-fixture',
		{ '.': { types: './index.d.ts', import: './index.js' } },
		{
			'index.d.ts': 'export {};\n',
			'index.js': '/* @octane-public-empty-marker */\n',
		},
	);

	assert.deepEqual(
		inspectPublicExports(packageDirectory).targets.map(({ validation }) => validation),
		['module-exports', 'empty-marker'],
	);
});

test('does not treat erased type-only imports as a side-effect contract', () => {
	for (const [name, source] of [
		['clause', "import type { FixtureType } from './types.js';\n"],
		['specifier', "import { type FixtureType } from './types.js';\n"],
	]) {
		const packageDirectory = createPackage(
			`@octanejs/type-only-import-${name}-fixture`,
			{ '.': './src/index.ts' },
			{
				'src/index.ts': source,
				'src/types.ts': 'export interface FixtureType { ready: boolean }\n',
			},
		);

		assert.throws(() => inspectPublicExports(packageDirectory), /no public contract/i);
	}
});

test('resolves CommonJS re-exports instead of accepting an empty assignment', () => {
	const reexport = createPackage(
		'@octanejs/commonjs-reexport-fixture',
		{ '.': './index.cjs' },
		{
			'index.cjs': "module.exports = require('./empty.cjs');\n",
			'empty.cjs': 'module.exports = {};\n',
		},
	);

	assert.throws(() => inspectPublicExports(reexport), /no public contract/i);
});

test('defers prepack-generated public targets to packed-artifact validation', () => {
	const packageDirectory = createPackage(
		'@octanejs/generated-fixture',
		{ '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
		{},
		{ prepack: 'node scripts/build.mjs' },
	);

	assert.deepEqual(
		inspectPublicExports(packageDirectory).targets.map(({ validation }) => validation),
		['packed-artifact', 'packed-artifact'],
	);
});

test('applies exact and more-specific null exclusions before expanding wildcard exports', () => {
	const packageDirectory = createPackage(
		'@octanejs/wildcard-exclusion-fixture',
		{
			'./features/*': './src/features/*.ts',
			'./features/private/*': null,
			'./features/hidden': null,
		},
		{
			'src/features/public.ts': 'export const visible = true;\n',
			'src/features/hidden.ts': 'export const hidden = true;\n',
			'src/features/private/secret.ts': 'export const secret = true;\n',
		},
	);

	assert.deepEqual(
		concretePublicSpecifiers(packageDirectory, '@octanejs/wildcard-exclusion-fixture'),
		['@octanejs/wildcard-exclusion-fixture/features/public'],
	);
});

test('accepts the public export contracts of every publishable workspace package', () => {
	const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
	const failures = [];
	for (const name of readdirSync(path.join(workspaceRoot, 'packages'))) {
		const packageDirectory = path.join(workspaceRoot, 'packages', name);
		const manifestPath = path.join(packageDirectory, 'package.json');
		if (!existsSync(manifestPath)) continue;
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		if (manifest.private || !manifest.exports) continue;
		try {
			inspectPublicExports(packageDirectory);
		} catch (error) {
			failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	assert.deepEqual(failures, []);
});
