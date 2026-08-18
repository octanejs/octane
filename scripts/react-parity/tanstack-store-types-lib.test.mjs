import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
	TYPE_PARITY_CONFIG,
	buildTypeInventory,
	verifyTanstackStoreTypes,
} from './tanstack-store-types-lib.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'tanstack-store-types-'));
	const upstreamRoot = join(root, 'upstream');
	const adaptedRoot = join(root, 'adapted');
	await cp(join(REPO, 'packages/tanstack-store/upstream/tests'), upstreamRoot, {
		recursive: true,
	});
	await cp(join(REPO, 'packages/tanstack-store/typetests'), adaptedRoot, {
		recursive: true,
	});
	await rm(join(adaptedRoot, 'tsconfig.json'), { force: true });
	await rm(join(adaptedRoot, '_useStore-omission.test-d.ts'), { force: true });
	return {
		root,
		upstreamRoot,
		adaptedRoot,
		config: {
			upstreamRoot: 'upstream',
			adaptedRoot: 'adapted',
			file: 'test.test-d.ts',
			inventories: {
				upstream: 'pristine-types.json',
				adapted: 'adapted-types.json',
			},
		},
	};
}

test('committed tanstack-store type inventories verify', function committedInventoriesVerify() {
	const summary = verifyTanstackStoreTypes(REPO, { configPath: TYPE_PARITY_CONFIG });
	assert.equal(summary.files, 1);
	assert.ok(summary.assertions > 2);
});

test('assertion group compare ignores @ts-expect-error inside pristine-only _useStore blocks', async function ignoresOmittedExpectError(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const upstreamFile = join(value.upstreamRoot, 'test.test-d.ts');
	const source = await readFile(upstreamFile, 'utf8');
	assert.match(source, /test\('_useStore returns setState for plain stores'/);
	const mutated = source.replace(
		'const [selected, setState] = _useStore(store, (state) => state)',
		[
			'// @ts-expect-error intentional pristine-only control',
			'  const [selected, setState] = _useStore(store, (state) => state)',
		].join('\n  '),
	);
	assert.notEqual(mutated, source);
	await writeFile(upstreamFile, mutated);
	assert.doesNotThrow(function run() {
		buildTypeInventory(value.root, value.config);
	});
});

test('assertion group compare still rejects adapted @ts-expect-error drift', async function rejectsAdaptedExpectErrorDrift(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const adaptedFile = join(value.adaptedRoot, 'test.test-d.ts');
	const source = await readFile(adaptedFile, 'utf8');
	assert.equal(source.includes('@ts-expect-error'), true);
	await writeFile(adaptedFile, source.replace(/\s*\/\/\s*@ts-expect-error[^\n]*\n/, '\n'));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /assertion groups differ/);
});

test('rejects deleting a required upstream pristine-only _useStore case', async function rejectsDeletedPristineOnly(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const upstreamFile = join(value.upstreamRoot, 'test.test-d.ts');
	const source = await readFile(upstreamFile, 'utf8');
	const title = '_useStore returns setState for plain stores';
	const pattern = new RegExp(
		`test\\('${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[\\s\\S]*?\\n\\}\\)\\n`,
	);
	const mutated = source.replace(pattern, '');
	assert.notEqual(mutated, source);
	await writeFile(upstreamFile, mutated);
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /missing required pristine-only test/);
});

test('pristine inventory records each required pristine-only _useStore case', function inventoriesPristineOnly() {
	const config = JSON.parse(readFileSync(join(REPO, TYPE_PARITY_CONFIG), 'utf8'));
	const inventory = buildTypeInventory(REPO, config);
	const pristineOnly = inventory.upstream.filter(function isPristineOnly(entry) {
		return entry.role === 'pristine-only';
	});
	assert.deepEqual(
		pristineOnly.map(function titleOf(entry) {
			return entry.title;
		}),
		[
			'_useStore returns actions for stores with actions',
			'_useStore returns setState for plain stores',
		],
	);
	for (const entry of pristineOnly) {
		assert.ok(entry.assertionGroups.length >= 1);
		assert.match(entry.sha256, /^[a-f0-9]{64}$/);
	}
});

test('config still documents the intentional _useStore omission', function documentsOmission() {
	const config = JSON.parse(readFileSync(join(REPO, TYPE_PARITY_CONFIG), 'utf8'));
	assert.ok(
		config.permittedTransformations.some(function isOmission(entry) {
			return entry.kind === 'intentional-omission';
		}),
	);
	assert.deepEqual(config.adaptedEvidence, [
		'packages/tanstack-store/typetests/_useStore-omission.test-d.ts',
	]);
});

test('adaptedEvidence inventories the omission assertion, not mere existence', function inventoriesOmissionEvidence() {
	const config = JSON.parse(readFileSync(join(REPO, TYPE_PARITY_CONFIG), 'utf8'));
	const inventory = buildTypeInventory(REPO, config);
	const evidence = inventory.adapted.find(function isEvidence(entry) {
		return entry.role === 'divergence-evidence';
	});
	assert.ok(evidence);
	assert.equal(evidence.path, 'packages/tanstack-store/typetests/_useStore-omission.test-d.ts');
	assert.ok(evidence.assertionGroups.length >= 2);
	const source = readFileSync(join(REPO, evidence.path), 'utf8');
	assert.match(source, /expectTypeOf\(binding\)\.not\.toHaveProperty\('_useStore'\)/);
});

test('rejects deleting adaptedEvidence omission file', async function rejectsDeletedOmission(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const evidenceRel = 'adapted/_useStore-omission.test-d.ts';
	await writeFile(
		join(value.root, evidenceRel),
		[
			"import { expectTypeOf, test } from 'vitest';",
			"import * as binding from '../src';",
			'',
			"test('omits the upstream experimental _useStore hook', () => {",
			"\texpectTypeOf(binding).not.toHaveProperty('_useStore');",
			'});',
			'',
		].join('\n'),
	);
	const config = {
		...value.config,
		adaptedEvidence: [evidenceRel],
	};
	assert.doesNotThrow(function run() {
		buildTypeInventory(value.root, config);
	});
	await rm(join(value.root, evidenceRel));
	assert.throws(function run() {
		buildTypeInventory(value.root, config);
	}, /missing adaptedEvidence|ENOENT|no such file/i);
});

test('rejects emptying adaptedEvidence omission module', async function rejectsEmptyOmission(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const evidenceRel = 'adapted/_useStore-omission.test-d.ts';
	await writeFile(join(value.root, evidenceRel), 'export {};\n');
	const config = {
		...value.config,
		adaptedEvidence: [evidenceRel],
	};
	assert.throws(function run() {
		buildTypeInventory(value.root, config);
	}, /must assert expectTypeOf/);
});

test('rejects hollow adaptedEvidence test shell without the omission assertion', async function rejectsHollowOmission(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const evidenceRel = 'adapted/_useStore-omission.test-d.ts';
	await writeFile(
		join(value.root, evidenceRel),
		[
			"import { test } from 'vitest';",
			'',
			"test('omits the upstream experimental _useStore hook', () => {});",
			'',
		].join('\n'),
	);
	const config = {
		...value.config,
		adaptedEvidence: [evidenceRel],
	};
	assert.throws(function run() {
		buildTypeInventory(value.root, config);
	}, /must assert expectTypeOf/);
});

test('rejects mutating adaptedEvidence omission assertion', async function rejectsMutatedOmission(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const evidenceRel = 'adapted/_useStore-omission.test-d.ts';
	const absolute = join(value.root, evidenceRel);
	await writeFile(
		absolute,
		[
			"import { expectTypeOf, test } from 'vitest';",
			"import * as binding from '../src';",
			'',
			"test('omits the upstream experimental _useStore hook', () => {",
			"\texpectTypeOf(binding).not.toHaveProperty('_useStore');",
			'});',
			'',
		].join('\n'),
	);
	const config = {
		...value.config,
		adaptedEvidence: [evidenceRel],
	};
	assert.doesNotThrow(function run() {
		buildTypeInventory(value.root, config);
	});
	await writeFile(
		absolute,
		[
			"import { expectTypeOf, test } from 'vitest';",
			"import * as binding from '../src';",
			'',
			"test('omits the upstream experimental _useStore hook', () => {",
			"\texpectTypeOf(binding).not.toHaveProperty('useSelector');",
			'});',
			'',
		].join('\n'),
	);
	assert.throws(function run() {
		buildTypeInventory(value.root, config);
	}, /must assert expectTypeOf/);
});
