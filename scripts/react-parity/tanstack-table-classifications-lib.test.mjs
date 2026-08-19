import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyTanstackTableTestClassifications } from './tanstack-table-classifications-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'tanstack-table-classifications-'));
	await cp(
		new URL('../../packages/tanstack-table/tests', import.meta.url),
		join(root, 'packages/tanstack-table/tests'),
		{ recursive: true },
	);
	await cp(
		new URL('../../packages/tanstack-table/typetests', import.meta.url),
		join(root, 'packages/tanstack-table/typetests'),
		{ recursive: true },
	);
	for (const file of ['test-classifications.json', 'react-parity.json']) {
		await cp(
			new URL(`../../packages/tanstack-table/audit/${file}`, import.meta.url),
			join(root, `packages/tanstack-table/audit/${file}`),
			{ recursive: true },
		);
	}
	return root;
}

test('verifies the tanstack-table classification ledger including type tests', function () {
	const root = fileURLToPath(new URL('../..', import.meta.url));
	assert.deepEqual(verifyTanstackTableTestClassifications(root), {
		tests: 11,
		pristineTypes: 1,
		adaptedTypes: 1,
	});
});

test('rejects an unclassified runtime test', async function (t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await writeFile(
		join(root, 'packages/tanstack-table/tests/conformance/extra.test.ts'),
		'export {};\n',
	);
	assert.throws(function run() {
		verifyTanstackTableTestClassifications(root);
	}, /exactly one classification/);
});

test('rejects an unclassified pristine type test', async function (t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await writeFile(
		join(root, 'packages/tanstack-table/typetests/pristine/extra.test-d.ts'),
		'export {};\n',
	);
	assert.throws(function run() {
		verifyTanstackTableTestClassifications(root);
	}, /exactly one classification/);
});

test('rejects an unclassified adapted type test', async function (t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await writeFile(
		join(root, 'packages/tanstack-table/typetests/adapted/extra.test-d.ts'),
		'export {};\n',
	);
	assert.throws(function run() {
		verifyTanstackTableTestClassifications(root);
	}, /exactly one classification/);
});
