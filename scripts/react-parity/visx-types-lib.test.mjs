import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { buildTypeInventory } from './visx-types-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'visx-types-'));
	const upstreamRoot = join(root, 'pristine');
	const adaptedRoot = join(root, 'adapted');
	await cp(new URL('../../packages/visx/typetests/pristine', import.meta.url), upstreamRoot, {
		recursive: true,
	});
	await cp(new URL('../../packages/visx/typetests/adapted', import.meta.url), adaptedRoot, {
		recursive: true,
	});
	await rm(join(upstreamRoot, 'tsconfig.json'), { force: true });
	await rm(join(adaptedRoot, 'tsconfig.json'), { force: true });
	return {
		root,
		upstreamRoot,
		adaptedRoot,
		config: { upstreamRoot: 'pristine', adaptedRoot: 'adapted' },
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
	}, /every upstream type artifact/);
});

test('rejects deleting an adapted assertion call', async function rejectsDeletedAssertion(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'types.test-d.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(file, source.replace(/\n\tacceptCentroidReturn\(octaneRenderable\);/, ''));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /assertion call shapes differ/);
});

test('rejects removing a pristine @ts-expect-error', async function rejectsRemovedExpectError(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.upstreamRoot, 'types.test-d.ts');
	const source = await readFile(file, 'utf8');
	assert.equal(source.includes('@ts-expect-error'), true, 'fixture must contain @ts-expect-error');
	await writeFile(file, source.replace(/\s*\/\/\s*@ts-expect-error[^\n]*\n/, '\n'));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /one @ts-expect-error per paired reject call/);
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
		source.replace(
			"from '../../src/shape/shapes/Pie.tsrx'",
			"from '../../src/shape/shapes/Arc.tsrx'",
		),
	);
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /change outside the permitted transformations/);
});
