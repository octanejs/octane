import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { build, transform } from 'esbuild';
import { parseAst } from 'vite';
import {
	deniedRangesFor,
	HYDRATION_ONLY_DECLARATIONS,
	HYDRATION_ONLY_MODULES,
	mappedSourcePositions,
	resolveDeclarationRanges,
	retainedDeclarations,
	topLevelDeclarations,
	verifyControlCoverage,
	verifyHydrationFree,
} from './hydration-free-gates.mjs';

const parse = (text) => parseAst(text, { lang: 'ts' });
const octaneSource = path.resolve(import.meta.dirname, '../../packages/octane/src');

const fixture = [
	'let currentHydration: object | null = null;',
	'',
	'/** Leading comments are not part of the range. */',
	'function hydrationOnly(): number {',
	'\tfunction nested() {}',
	'\treturn 1;',
	'}',
	'',
	'export function clientOnly(): number {',
	'\tconst hydrationOnlyLocal = 2;',
	'\treturn hydrationOnlyLocal;',
	'}',
	'',
	'export class Capability {',
	'\tmethod() {}',
	'}',
	'const { a, b: [c] } = { a: 1, b: [2] };',
	'',
].join('\n');

const fixtureRanges = (denied) => resolveDeclarationRanges(() => fixture, parse, denied);

test('top-level declarations include exports and destructuring and ignore nested ones', () => {
	assert.deepEqual(
		[...topLevelDeclarations(parse(fixture)).keys()],
		['currentHydration', 'hydrationOnly', 'clientOnly', 'Capability', 'a', 'c'],
	);
});

test('a deny-listed declaration resolves to its exact source range', () => {
	assert.deepEqual(
		fixtureRanges([
			{ name: 'currentHydration', source: 'runtime.ts' },
			{ name: 'hydrationOnly', source: 'runtime.ts' },
			{ name: 'Capability', source: 'runtime.ts' },
		]).map(({ name, startLine, startColumn, endLine, endColumn }) => [
			name,
			startLine,
			startColumn,
			endLine,
			endColumn,
		]),
		[
			// A variable's range is its declarator, after the statement's keyword.
			['currentHydration', 0, 4, 0, 42],
			['hydrationOnly', 3, 0, 6, 1],
			['Capability', 13, 7, 15, 1],
		],
	);
});

test('a renamed or nested declaration fails with every missing name', () => {
	assert.throws(
		() =>
			fixtureRanges([
				{ name: 'hydrationOnly', source: 'runtime.ts' },
				{ name: 'nested', source: 'runtime.ts' },
				{ name: 'renamedAway', source: 'signals/early-values.ts' },
			]),
		(error) =>
			/no longer top-level declarations/.test(error.message) &&
			error.message.includes('nested  [packages/octane/src/runtime.ts]') &&
			error.message.includes('renamedAway  [packages/octane/src/signals/early-values.ts]') &&
			!error.message.includes('hydrationOnly'),
	);
});

test('every committed deny-listed declaration exists in the client source', () => {
	const names = HYDRATION_ONLY_DECLARATIONS.map(({ name, source }) => `${source}#${name}`);
	assert.equal(new Set(names).size, names.length, 'duplicate deny-listed declaration');
	const ranges = resolveDeclarationRanges(
		(source) => fs.readFileSync(path.join(octaneSource, source), 'utf8'),
		parse,
	);
	assert.equal(ranges.length, HYDRATION_ONLY_DECLARATIONS.length);
	for (const { startLine, endLine } of ranges) assert.ok(startLine <= endLine);
	assert.equal(
		HYDRATION_ONLY_MODULES.some((pattern) =>
			pattern.test('/r/packages/octane/src/hydration/index.ts'),
		),
		true,
	);
});

test('esbuild is held to every hydration body but not to the foldOnly state cells', () => {
	const ranges = fixtureRanges([
		{ name: 'currentHydration', source: 'runtime.ts', foldOnly: true },
		{ name: 'hydrationOnly', source: 'runtime.ts' },
	]);
	assert.deepEqual(
		deniedRangesFor('rolldown', ranges).map(({ name }) => name),
		['currentHydration', 'hydrationOnly'],
	);
	assert.deepEqual(
		deniedRangesFor('esbuild', ranges).map(({ name }) => name),
		['hydrationOnly'],
	);
	assert.throws(() => deniedRangesFor('vite', ranges), /unknown bundler/);
	// The committed state cells are the only foldOnly entries.
	assert.deepEqual(
		HYDRATION_ONLY_DECLARATIONS.filter(({ foldOnly }) => foldOnly).map(({ name }) => name),
		[
			'currentHydration',
			'activeHydration',
			'seedHydration',
			'PRESENTATION_HYDRATION',
			'preservedHydrateActivationCount',
			'NATIVE_ADOPTION_RELEASES',
		],
	);
});

test('source map segments decode to their source index and original position', () => {
	// AAAA: source 0, line 0, column 0. AACA: line +1. EAAE: original column +2.
	// A: no source. gBAAgB: original column +16 with a multi-digit VLQ, still
	// line 1. ACAA: source 1.
	assert.deepEqual(
		[...mappedSourcePositions('AAAA;AACA,EAAE,A;gBAAgB,ACAA')],
		[
			[0, 0, 0],
			[0, 1, 0],
			[0, 1, 2],
			[0, 1, 18],
			[1, 1, 18],
		],
	);
	assert.throws(() => [...mappedSourcePositions('AA!A')], /invalid source map/);
});

test('retention follows the source map, so inlined code still counts and dropped code does not', () => {
	const ranges = fixtureRanges([
		{ name: 'currentHydration', source: 'runtime.ts' },
		{ name: 'hydrationOnly', source: 'runtime.ts' },
		{ name: 'Capability', source: 'runtime.ts' },
	]);
	const map = (mappings, source = '../../packages/octane/src/runtime.ts') => ({
		sources: ['other.ts', source],
		mappings,
	});
	// A segment on line 5 of runtime.ts: inside hydrationOnly's body, as when a
	// minifier inlines it into a caller and its name disappears.
	assert.deepEqual([...retainedDeclarations(map('ACKA'), ranges)], ['hydrationOnly']);
	// The same line in another file is not runtime.ts.
	assert.deepEqual([...retainedDeclarations(map('AAKA'), ranges)], []);
	// Line 2 (the leading comment), line 7 (between declarations) and line 8
	// (clientOnly) retain nothing.
	assert.deepEqual([...retainedDeclarations(map('ACEA'), ranges)], []);
	assert.deepEqual([...retainedDeclarations(map('ACOA,ACCA'), ranges)], []);
	// Windows separators and absolute paths resolve below packages/octane/src.
	// ACAI: line 0, column 4, the declarator `currentHydration = null`.
	assert.deepEqual(
		[...retainedDeclarations(map('ACAI', 'C:\\r\\packages\\octane\\src\\runtime.ts'), ranges)],
		['currentHydration'],
	);
	// A deny-listed source that is not in the map retains nothing.
	assert.deepEqual([...retainedDeclarations(map('ACAI', 'src/runtime.ts'), ranges)], []);
});

test('a joined statement keyword does not retain the declarator a minifier removed from it', () => {
	// oxc joins `let removed = null;` with a later surviving variable statement,
	// then drops `removed` once constant folding leaves it unused. The joined
	// statement keeps the first statement's position, so its `var` keyword maps
	// to column 0 of `removed`'s line while the surviving declarator maps to its
	// own line: `var kept = null;`.
	const source = ['let removed = null;', 'function f() {}', 'let kept = null;'].join('\n');
	const ranges = resolveDeclarationRanges(() => source, parse, [
		{ name: 'removed', source: 'runtime.ts' },
		{ name: 'kept', source: 'runtime.ts' },
	]);
	const map = (mappings) => ({ sources: ['../../packages/octane/src/runtime.ts'], mappings });
	// AAAA: `var` -> line 0, column 0. IAEI: `kept` -> line 2, column 4.
	assert.deepEqual([...retainedDeclarations(map('AAAA,IAEI'), ranges)], ['kept']);
	// A retained `removed` maps its own declarator: line 0, column 4.
	assert.deepEqual([...retainedDeclarations(map('AAAI'), ranges)], ['removed']);
	// The trailing `;` after a declarator is outside it as well.
	assert.deepEqual([...retainedDeclarations(map('AAAmB'), ranges)], []);
});

test('a real production source map retains the kept declaration and not the dropped one', async () => {
	const source = [
		'function hydrationOnly(): number {',
		'\treturn 1;',
		'}',
		'function clientOnly(): number {',
		'\treturn 2;',
		'}',
		'export function render(): number {',
		"\tif (process.env.NODE_ENV !== 'production') return hydrationOnly();",
		'\treturn clientOnly();',
		'}',
	].join('\n');
	const sourcefile = '/repository/packages/octane/src/runtime.ts';
	const result = await transform(source, {
		loader: 'ts',
		format: 'esm',
		minify: true,
		treeShaking: true,
		sourcemap: 'external',
		sourcefile,
		define: { 'process.env.NODE_ENV': '"production"' },
	});
	const ranges = resolveDeclarationRanges(() => source, parse, [
		{ name: 'hydrationOnly', source: 'runtime.ts' },
		{ name: 'clientOnly', source: 'runtime.ts' },
	]);
	assert.deepEqual([...retainedDeclarations(JSON.parse(result.map), ranges)], ['clientOnly']);
	// The same oracle over a bundle, whose map lists every input file.
	const bundled = await build({
		stdin: { contents: source, loader: 'ts', sourcefile, resolveDir: import.meta.dirname },
		bundle: true,
		write: false,
		outfile: path.join(import.meta.dirname, '.hydration-free/test.js'),
		format: 'esm',
		minify: true,
		sourcemap: 'external',
		define: { 'process.env.NODE_ENV': '"development"' },
		logLevel: 'silent',
	});
	const bundledMap = JSON.parse(
		bundled.outputFiles.find((file) => file.path.endsWith('.map')).text,
	);
	assert.deepEqual([...retainedDeclarations(bundledMap, ranges)].sort(), [
		'clientOnly',
		'hydrationOnly',
	]);
});

test('a client that retains hydration code fails with every declaration and module', () => {
	const ranges = fixtureRanges([
		{ name: 'currentHydration', source: 'runtime.ts' },
		{ name: 'hydrationOnly', source: 'runtime.ts' },
		{ name: 'Capability', source: 'runtime.ts' },
	]);
	verifyHydrationFree(
		'clean',
		{ retained: new Set(), modules: ['/r/packages/octane/src/runtime.ts'] },
		ranges,
	);
	assert.throws(
		() =>
			verifyHydrationFree(
				'example',
				{
					retained: new Set(['currentHydration', 'Capability']),
					modules: ['/r/packages/octane/src/hydration/independent-island.ts'],
				},
				ranges,
			),
		(error) =>
			error.message ===
			[
				'example: a createRoot-only client retained hydration code',
				'2 hydration-only declaration(s):',
				'  currentHydration  [packages/octane/src/runtime.ts:1-1]',
				'  Capability  [packages/octane/src/runtime.ts:14-16]',
				'1 hydration-only module(s):',
				'  /r/packages/octane/src/hydration/independent-island.ts',
			].join('\n'),
	);
});

test('every deny-listed declaration must be visible in some hydrating control', () => {
	const ranges = fixtureRanges([
		{ name: 'currentHydration', source: 'runtime.ts' },
		{ name: 'hydrationOnly', source: 'runtime.ts' },
	]);
	verifyControlCoverage(
		new Map([
			['vite', new Set(['currentHydration'])],
			['esbuild', new Set(['hydrationOnly'])],
		]),
		ranges,
	);
	assert.throws(
		() => verifyControlCoverage(new Map([['vite', new Set(['currentHydration'])]]), ranges),
		(error) =>
			/no hydrating control \(vite\) retains/.test(error.message) &&
			error.message.includes('hydrationOnly  [packages/octane/src/runtime.ts:4-7]') &&
			!error.message.includes('currentHydration  ['),
	);
	assert.throws(() => verifyControlCoverage(new Map(), ranges), /at least one hydrating control/);
});
