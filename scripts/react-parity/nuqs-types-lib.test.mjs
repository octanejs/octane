import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { buildTypeInventory, verifyNuqsTypes } from './nuqs-types-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'nuqs-types-'));
	const upstreamRoot = join(root, 'upstream');
	const adaptedRoot = join(root, 'adapted');
	await cp(new URL('../../packages/nuqs/typetests/pristine', import.meta.url), upstreamRoot, {
		recursive: true,
	});
	await cp(
		new URL('../../packages/nuqs/typetests/public-api.test-d.ts', import.meta.url),
		join(adaptedRoot, 'public-api.test-d.ts'),
	);
	await rm(join(upstreamRoot, 'tsconfig.json'), { force: true });
	return {
		root,
		upstreamRoot,
		adaptedRoot,
		config: { upstreamRoot: 'upstream', adaptedRoot: 'adapted' },
	};
}

test('rejects a missing adapted type-test file', async function rejectsMissingFile(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	await rm(join(value.adaptedRoot, 'public-api.test-d.ts'));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /every pristine type artifact/);
});

test('rejects deleting an adapted assertion', async function rejectsDeletedAssertion(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'public-api.test-d.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(
		file,
		source.replace(/\ntype _IntegerExact = Assert<Equal<Integer, number>>;\n/, '\n'),
	);
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /assertion groups differ/);
});

test('rejects removing an adapted @ts-expect-error', async function rejectsRemovedExpectError(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'public-api.test-d.ts');
	const source = await readFile(file, 'utf8');
	assert.equal(source.includes('@ts-expect-error'), true, 'fixture must contain @ts-expect-error');
	await writeFile(file, source.replace(/\s*\/\/\s*@ts-expect-error[^\n]*\n/, '\n'));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /assertion groups differ/);
});

test('rejects retargeting an adapted public import', async function rejectsRetargetedImport(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'public-api.test-d.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(file, source.replace("from '@octanejs/nuqs'", "from '@octanejs/nuqs/server'"));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /change outside the permitted transformations/);
});

test('verifyNuqsTypes fails closed when adapted include pulls in pristine probes', async function rejectsAdaptedPristineExtras(t) {
	const root = await mkdtemp(join(tmpdir(), 'nuqs-types-membership-'));
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await mkdir(join(root, 'packages/nuqs/audit'), { recursive: true });
	await mkdir(join(root, 'packages/nuqs/typetests/pristine'), { recursive: true });
	await cp(
		new URL('../../packages/nuqs/typetests/pristine/public-api.test-d.ts', import.meta.url),
		join(root, 'packages/nuqs/typetests/pristine/public-api.test-d.ts'),
	);
	await cp(
		new URL('../../packages/nuqs/typetests/public-api.test-d.ts', import.meta.url),
		join(root, 'packages/nuqs/typetests/public-api.test-d.ts'),
	);
	await writeFile(
		join(root, 'packages/nuqs/typetests/pristine/tsconfig.json'),
		`${JSON.stringify(
			{
				compilerOptions: { strict: true, noEmit: true, skipLibCheck: true },
				include: ['./public-api.test-d.ts'],
			},
			null,
			2,
		)}\n`,
	);
	await writeFile(
		join(root, 'packages/nuqs/typetests/tsconfig.json'),
		`${JSON.stringify(
			{
				compilerOptions: { strict: true, noEmit: true, skipLibCheck: true },
				include: ['./public-api.test-d.ts', './pristine/**/*.test-d.ts'],
			},
			null,
			2,
		)}\n`,
	);
	const config = {
		schemaVersion: 1,
		upstreamRoot: 'packages/nuqs/typetests/pristine',
		adaptedRoot: 'packages/nuqs/typetests',
		inventories: {
			upstream: 'packages/nuqs/audit/pristine-types.json',
			adapted: 'packages/nuqs/audit/adapted-types.json',
		},
		lanes: {
			pristine: {
				compiler: 'tsc',
				project: 'packages/nuqs/typetests/pristine/tsconfig.json',
			},
			adapted: {
				compiler: 'tsrx-tsc',
				project: 'packages/nuqs/typetests/tsconfig.json',
			},
		},
	};
	await writeFile(
		join(root, 'packages/nuqs/audit/type-parity.json'),
		`${JSON.stringify(config)}\n`,
	);
	const inventory = buildTypeInventory(root, config);
	await writeFile(
		join(root, 'packages/nuqs/audit/pristine-types.json'),
		`${JSON.stringify(inventory.upstream)}\n`,
	);
	await writeFile(
		join(root, 'packages/nuqs/audit/adapted-types.json'),
		`${JSON.stringify(inventory.adapted)}\n`,
	);
	assert.throws(function run() {
		verifyNuqsTypes(root);
	}, /program membership drifted/);
});

test('verifyNuqsTypes fails closed when a lane include empties the program', async function rejectsEmptyInclude(t) {
	const root = await mkdtemp(join(tmpdir(), 'nuqs-types-membership-'));
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await mkdir(join(root, 'packages/nuqs/audit'), { recursive: true });
	await mkdir(join(root, 'packages/nuqs/typetests/pristine'), { recursive: true });
	await cp(
		new URL('../../packages/nuqs/typetests/pristine/public-api.test-d.ts', import.meta.url),
		join(root, 'packages/nuqs/typetests/pristine/public-api.test-d.ts'),
	);
	await cp(
		new URL('../../packages/nuqs/typetests/public-api.test-d.ts', import.meta.url),
		join(root, 'packages/nuqs/typetests/public-api.test-d.ts'),
	);
	await writeFile(
		join(root, 'packages/nuqs/typetests/pristine/tsconfig.json'),
		`${JSON.stringify(
			{
				compilerOptions: { strict: true, noEmit: true, skipLibCheck: true },
				include: ['./public-api.test-d.ts'],
			},
			null,
			2,
		)}\n`,
	);
	await writeFile(
		join(root, 'packages/nuqs/typetests/tsconfig.json'),
		`${JSON.stringify(
			{
				compilerOptions: { strict: true, noEmit: true, skipLibCheck: true },
				include: [],
			},
			null,
			2,
		)}\n`,
	);
	const config = {
		schemaVersion: 1,
		upstreamRoot: 'packages/nuqs/typetests/pristine',
		adaptedRoot: 'packages/nuqs/typetests',
		inventories: {
			upstream: 'packages/nuqs/audit/pristine-types.json',
			adapted: 'packages/nuqs/audit/adapted-types.json',
		},
		lanes: {
			pristine: {
				compiler: 'tsc',
				project: 'packages/nuqs/typetests/pristine/tsconfig.json',
			},
			adapted: {
				compiler: 'tsrx-tsc',
				project: 'packages/nuqs/typetests/tsconfig.json',
			},
		},
	};
	await writeFile(
		join(root, 'packages/nuqs/audit/type-parity.json'),
		`${JSON.stringify(config)}\n`,
	);
	const inventory = buildTypeInventory(root, config);
	await writeFile(
		join(root, 'packages/nuqs/audit/pristine-types.json'),
		`${JSON.stringify(inventory.upstream)}\n`,
	);
	await writeFile(
		join(root, 'packages/nuqs/audit/adapted-types.json'),
		`${JSON.stringify(inventory.adapted)}\n`,
	);
	assert.throws(function run() {
		verifyNuqsTypes(root);
	}, /program membership drifted|not included by compiler project/);
});
