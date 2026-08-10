import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { buildTypeInventory } from './tanstack-table-types-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'tanstack-table-types-'));
	const upstreamRoot = join(root, 'upstream');
	const adaptedRoot = join(root, 'adapted');
	await cp(
		new URL('../../packages/tanstack-table/typetests/pristine', import.meta.url),
		upstreamRoot,
		{ recursive: true },
	);
	await cp(
		new URL('../../packages/tanstack-table/typetests/adapted', import.meta.url),
		adaptedRoot,
		{ recursive: true },
	);
	await rm(join(upstreamRoot, 'tsconfig.json'), { force: true });
	await rm(join(adaptedRoot, 'tsconfig.json'), { force: true });
	return {
		root,
		upstreamRoot,
		adaptedRoot,
		config: { upstreamRoot: 'upstream', adaptedRoot: 'adapted' },
	};
}

test('rejects a skipped adapted type-test file', async function rejectsSkippedFile(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	await rm(join(value.adaptedRoot, 'types.test-d.ts'));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /every pristine type artifact/);
});

test('rejects deleting an adapted assertion group', async function rejectsDeletedAssertion(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'types.test-d.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(
		file,
		source.replace(
			/\n\/\/ 4\. flexRender[\s\S]*?(?=\n\/\/ 5\. createTableHookContexts)/,
			'\n',
		),
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
	const file = join(value.adaptedRoot, 'types.test-d.ts');
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
	const file = join(value.adaptedRoot, 'types.test-d.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(
		file,
		source.replace("from '@octanejs/tanstack-table'", "from '@octanejs/tanstack-store'"),
	);
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /change outside the permitted transformations/);
});
