import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyPopperTestClassifications } from './popper-classifications-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'popper-classifications-'));
	await cp(
		new URL('../../packages/popper/tests', import.meta.url),
		join(root, 'packages/popper/tests'),
		{ recursive: true },
	);
	await cp(
		new URL('../../packages/popper/typetests', import.meta.url),
		join(root, 'packages/popper/typetests'),
		{ recursive: true },
	);
	for (const file of ['test-classifications.json', 'react-parity.json']) {
		await cp(
			new URL(`../../packages/popper/audit/${file}`, import.meta.url),
			join(root, `packages/popper/audit/${file}`),
			{ recursive: true },
		);
	}
	return root;
}

test('verifies the popper classification ledger', function verifiesLedger() {
	const root = fileURLToPath(new URL('../..', import.meta.url));
	assert.deepEqual(verifyPopperTestClassifications(root), { tests: 13 });
});

test('rejects an unclassified port-authored test', async function rejectsUnclassified(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await writeFile(join(root, 'packages/popper/tests/new.test.ts'), 'export {};\n');
	assert.throws(function run() {
		verifyPopperTestClassifications(root);
	}, /exactly one classification/);
});

test('rejects a parity classification without an oracle', async function rejectsMissingOracle(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/popper/audit/test-classifications.json');
	const config = JSON.parse(await readFile(path, 'utf8'));
	delete config.tests.find(function find(entry) {
		return entry.disposition === 'react-octane-differential';
	}).oracle;
	await writeFile(path, `${JSON.stringify(config)}\n`);
	assert.throws(function run() {
		verifyPopperTestClassifications(root);
	}, /requires a React oracle/);
});
