import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import {
	analyze,
	checkSplit,
	emit,
	emitSorted,
	orderConstraints,
	place,
	validate,
} from './split-runtime.mjs';

const FILE = path.join(import.meta.dirname, 'fixtures/split-runtime/src/runtime.ts');

const SOURCE = `/**
 * Fixture runtime.
 */

declare const process: { env: { NODE_ENV?: string } };

import { helper, type Shape } from './helper.js';
import type { OnlyType } from './types.js';

// The capability slot; core reads it above every feature.
let DRIVER: (() => number) | null = null;

let COUNT = 0;
const LABEL = 'a long label';

/** Core: reads the slot and the counter. */
export function core(): number {
	if (process.env.NODE_ENV !== 'production') helper();
	return DRIVER ? DRIVER() : COUNT;
}

// ---------------------------------------------------------------------------
// Feature section
// ---------------------------------------------------------------------------

/** Installs the slot. */
export function install(): void {
	DRIVER = feature;
}

function feature(): number {
	COUNT++;
	return LABEL.length;
}

export interface Exported extends Shape {
	value: OnlyType;
}

type Local = { id: string };

export function typed(value: Local): Exported['value'] {
	return value as never;
}

export function lazy(): Promise<unknown> {
	return import('./other.js');
}

export const SENTINEL = createSentinel();

function createSentinel(): { label: string } {
	return { label: LABEL };
}

export { helper };
`;

const model = () => analyze(FILE, SOURCE);

function mapOf(modules, extra = {}) {
	return {
		directory: 'runtime',
		facade: 'Facade.',
		modules: Object.entries(modules).map(([name, units]) => ({
			name,
			file: `${name}.ts`,
			title: name,
			summary: `The ${name} module.`,
			units,
		})),
		...extra,
	};
}

const ALL = [
	'DRIVER',
	'COUNT',
	'LABEL',
	'core',
	'install',
	'feature',
	'Exported',
	'Local',
	'typed',
	'lazy',
	'SENTINEL',
	'createSentinel',
];

test('analysis records writes, type positions and load-time reads', () => {
	const { unitByName } = model();
	assert.equal(unitByName.get('install').refs.get('DRIVER').write, 1);
	assert.equal(unitByName.get('feature').refs.get('COUNT').write, 1);
	assert.equal(unitByName.get('core').refs.get('DRIVER').read, 2);
	assert.equal(unitByName.get('typed').refs.get('Local').type, 1);
	assert.equal(unitByName.get('typed').importRefs.size, 0);
	assert.deepEqual(unitByName.get('Exported').importRefs.get('Shape'), { value: 0, type: 1 });
	assert.deepEqual([...unitByName.get('SENTINEL').loadCalls], ['createSentinel']);
	assert.equal(unitByName.get('LABEL').primitive, true);
	assert.equal(unitByName.get('LABEL').inlined, false);
	assert.equal(unitByName.get('core').ambientRefs.has('process'), true);
});

test('a binding lives with every function that assigns it', () => {
	const m = model();
	const map = mapOf({
		core: [
			'DRIVER',
			'COUNT',
			'LABEL',
			'core',
			'Exported',
			'Local',
			'typed',
			'lazy',
			'SENTINEL',
			'createSentinel',
		],
		feature: ['install', 'feature'],
	});
	const { moduleOf } = place(m, map);
	const { violations } = validate(m, map, moduleOf);
	assert.deepEqual(violations.filter((v) => v.startsWith('write:')).sort(), [
		'write: feature (feature) assigns COUNT (core)',
		'write: install (feature) assigns DRIVER (core)',
	]);
});

test('a slot stays above the reads its minifier folds, and initializers read their own module', () => {
	const m = model();
	// The slot moves below core with its installer: core's fold would be lost.
	const late = mapOf({
		core: ['core', 'Exported', 'Local', 'typed', 'lazy'],
		feature: ['DRIVER', 'COUNT', 'LABEL', 'install', 'feature', 'SENTINEL', 'createSentinel'],
	});
	const placed = place(m, late);
	const result = validate(m, late, placed.moduleOf);
	assert.deepEqual(result.chain, ['feature', 'core']);
	assert.deepEqual(result.violations, []);
	assert.ok(
		orderConstraints(m, late).some(
			(c) => c.rule === 'fold' && c.before.id === 'DRIVER' && c.after.id === 'core',
		),
	);
	// A module-scope initializer that reads another module's binding is refused.
	const split = mapOf({
		core: [
			'DRIVER',
			'COUNT',
			'LABEL',
			'core',
			'install',
			'feature',
			'Exported',
			'Local',
			'typed',
			'lazy',
			'createSentinel',
		],
		sentinel: ['SENTINEL'],
	});
	const { violations } = validate(m, split, place(m, split).moduleOf);
	assert.deepEqual(violations, [
		'load: SENTINEL (sentinel) reads LABEL (core) at load via createSentinel',
	]);
});

test('unmapped declarations get a suggestion and stale entries are reported', () => {
	const m = model();
	const map = mapOf({ core: ALL.filter((id) => id !== 'feature').concat('removedLongAgo') });
	const { unmapped, stale } = place(m, map);
	assert.deepEqual(
		unmapped.map((u) => [u.id, u.suggestion, u.reason]),
		[['feature', 'core', 'assigns COUNT']],
	);
	assert.deepEqual(stale, [{ id: 'removedLongAgo', module: 'core' }]);
});

test('the split moves text unchanged, exports what other modules name, and keeps comments', () => {
	const m = model();
	const map = mapOf(
		{
			core: [
				'DRIVER',
				'COUNT',
				'LABEL',
				'core',
				'install',
				'feature',
				'SENTINEL',
				'createSentinel',
			],
			types: ['Exported', 'Local'],
			extras: ['typed', 'lazy'],
		},
		{ sectionComments: { install: 'extras' } },
	);
	const { moduleOf } = place(m, map);
	const { violations, chain } = validate(m, map, moduleOf);
	assert.deepEqual(violations, []);
	assert.deepEqual(chain, ['core', 'extras']);
	const files = emit(m, map, moduleOf, chain);
	const dir = path.join(path.dirname(FILE), 'runtime');
	const core = files.get(path.join(dir, 'core.ts'));
	const extras = files.get(path.join(dir, 'extras.ts'));
	const types = files.get(path.join(dir, 'types.ts'));
	const facade = files.get(FILE);
	// Comments travel with their declarations; the section header follows its section.
	assert.match(core, /\/\/ The capability slot; core reads it above every feature\.\nlet DRIVER/);
	assert.match(core, /\/\*\* Installs the slot\. \*\/\nexport function install/);
	assert.doesNotMatch(core, /Feature section/);
	assert.match(extras, /Feature section\n\/\/ -+\n\n+export function typed/);
	// The first runtime module imports nothing for order; the next imports it
	// first, naming nothing when it needs no value from it.
	assert.doesNotMatch(core, /from ["']\.\/extras\.js["']/);
	assert.match(
		extras,
		/^\/\/ The extras module\.\n\n\/\/ Evaluates after [^\n]*\nexport \{\} from ["']\.\/core\.js["'];$/m,
	);
	// Ambient declarations are copied where they are named; relative paths move.
	assert.match(core, /declare const process/);
	assert.match(core, /import \{ helper \} from ["']\.\.\/helper\.js["'];/);
	assert.match(extras, /return import\('\.\.\/other\.js'\);/);
	assert.match(extras, /import type \{ Exported, Local \} from ["']\.\/types\.js["'];/);
	assert.match(types, /export interface Exported extends Shape/);
	assert.match(types, /export type Local/);
	assert.match(types, /import type \{ Shape \} from ["']\.\.\/helper\.js["'];/);
	assert.match(types, /import type \{ OnlyType \} from ["']\.\.\/types\.js["'];/);
	// The facade pins the dependency order, then re-exports the surface.
	assert.match(facade, /^\/\*\*\n \* Fixture runtime\.\n \*\//);
	assert.match(
		facade,
		/export \{\} from ["']\.\/helper\.js["'];\nexport \{\} from ["']\.\/runtime\/extras\.js["'];/,
	);
	assert.doesNotMatch(facade, /from ["']\.\/types\.js["'];/);
	assert.match(facade, /export \{ core, install, SENTINEL \} from ["']\.\/runtime\/core\.js["'];/);
	assert.match(facade, /export type \{ Exported \} from ["']\.\/runtime\/types\.js["'];/);
	assert.match(facade, /export \{ helper \} from ["']\.\/helper\.js["'];/);
	// Every statement appears exactly once across the modules.
	for (const name of ['let DRIVER', 'function feature', 'type Local', 'function createSentinel'])
		assert.equal([core, extras, types].join('\n').split(name).length, 2, name);
});

test('the sorted single file holds the split modules in evaluation order', () => {
	const m = model();
	const map = mapOf({
		late: ['lazy'],
		core: ALL.filter((id) => id !== 'lazy'),
	});
	const { moduleOf } = place(m, map);
	const { chain } = validate(m, map, moduleOf);
	const sorted = emitSorted(m, map, moduleOf, chain);
	assert.ok(sorted.indexOf('export function lazy') < sorted.indexOf('let DRIVER'));
	assert.equal(sorted.length, SOURCE.length);
});

test('the order search keeps the constraints and puts similar modules within gzip reach', async () => {
	const { searchOrder } = await import('./split-runtime-order.mjs');
	let state = 7;
	const noise = (n) =>
		Array.from({ length: n }, () =>
			String.fromCharCode(97 + (((state = (state * 1103515245 + 12345) >>> 0) >>> 16) % 26)),
		).join('');
	// a and c emit the same 8 KB; b emits 40 KB of noise, past gzip's 32 KB window.
	const shared = noise(8192);
	const runs = [
		{ key: null, text: 'prefix;' },
		{ key: 'a', text: shared },
		{ key: 'b', text: noise(40960) },
		{ key: 'c', text: shared },
	];
	const chunks = { shell: { runs, modules: new Set(['a', 'b', 'c']) } };
	const before = new Map([
		['a', new Set()],
		['b', new Set()],
		['c', new Set(['a'])],
	]);
	const result = searchOrder({ chain: ['a', 'b', 'c'], before, chunks, evals: 200, seeds: 1 });
	assert.ok(result.order.indexOf('a') < result.order.indexOf('c'));
	assert.equal(Math.abs(result.order.indexOf('a') - result.order.indexOf('c')), 1);
	assert.ok(result.after.shell < result.before.shell - 4000);
});

test('the split layout keeps the load rule and its order links', (t) => {
	const m = model();
	const map = mapOf({
		core: ['DRIVER', 'COUNT', 'LABEL', 'core', 'install', 'feature', 'SENTINEL', 'createSentinel'],
		types: ['Exported', 'Local'],
		extras: ['typed', 'lazy'],
	});
	const { moduleOf } = place(m, map);
	const { chain } = validate(m, map, moduleOf);
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'split-runtime-check-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	for (const [file, text] of emit(m, map, moduleOf, chain)) {
		const out = path.join(root, path.relative(path.dirname(FILE), file));
		fs.mkdirSync(path.dirname(out), { recursive: true });
		fs.writeFileSync(out, text);
	}
	const facade = path.join(root, 'runtime.ts');
	const extras = path.join(root, 'runtime/extras.ts');
	assert.deepEqual(checkSplit(facade, [], new Set()).violations, []);
	const clean = fs.readFileSync(extras, 'utf8');
	// A module-scope initializer that reads another module's binding.
	fs.writeFileSync(
		extras,
		`${clean}\nimport { SENTINEL } from './core.js';\nexport const COPY = SENTINEL.label;\n`,
	);
	assert.deepEqual(checkSplit(facade, [], new Set()).violations, [
		'load: COPY (extras) reads SENTINEL (core) at load',
	]);
	// Without extras' order link, the chain runtime.ts names ends at extras and
	// core, the module before it, falls off.
	const unlinked = clean.replace(/^export \{\} from ["']\.\/core\.js["'];$/m, '');
	assert.notEqual(unlinked, clean);
	fs.writeFileSync(extras, unlinked);
	assert.match(
		checkSplit(facade, [], new Set()).violations.join('\n'),
		/^link: core is not on the evaluation chain/,
	);
});

test('the split layout reports a driver moved below a reader that folds it', (t) => {
	const m = model();
	const map = mapOf({
		core: ['DRIVER', 'COUNT', 'LABEL', 'core', 'install', 'feature', 'SENTINEL', 'createSentinel'],
		types: ['Exported', 'Local'],
		extras: ['typed', 'lazy'],
	});
	const { moduleOf } = place(m, map);
	const { chain } = validate(m, map, moduleOf);
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'split-runtime-order-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	for (const [file, text] of emit(m, map, moduleOf, chain)) {
		const out = path.join(root, path.relative(path.dirname(FILE), file));
		fs.mkdirSync(path.dirname(out), { recursive: true });
		fs.writeFileSync(out, text);
	}
	const facade = path.join(root, 'runtime.ts');
	const core = path.join(root, 'runtime/core.ts');
	assert.deepEqual(checkSplit(facade, [], new Set()).violations, []);
	// Relocate the driver's `let` below core(), which reads and folds it.
	const text = fs.readFileSync(core, 'utf8');
	const declaration = text.match(/^let DRIVER[^\n]*\n/m)[0];
	fs.writeFileSync(core, `${text.replace(declaration, '')}\n${declaration}`);
	assert.deepEqual(checkSplit(facade, [], new Set()).violations, [
		'order: core (core) reads DRIVER (core), which evaluates after it (fold)',
	]);
	// A baseline entry for a read now in order is stale.
	fs.writeFileSync(core, text);
	assert.deepEqual(checkSplit(facade, [], new Set(['core > DRIVER'])).violations, [
		'order: core > DRIVER is in order now; remove it from ORDER_BASELINE',
	]);
});

test('the committed runtime modules keep the split layout rules', () => {
	assert.deepEqual(checkSplit().violations, []);
});
