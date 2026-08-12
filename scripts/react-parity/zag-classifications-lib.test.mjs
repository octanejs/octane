import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { verifyZagTestClassifications } from './zag-classifications-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'zag-classifications-'));
	await cp(new URL('../../packages/zag/tests', import.meta.url), join(root, 'packages/zag/tests'), {
		recursive: true,
	});
	await cp(
		new URL('../../packages/zag/audit/test-classifications.json', import.meta.url),
		join(root, 'packages/zag/audit/test-classifications.json'),
	);
	return root;
}

test('rejects an unclassified port-authored test', async function rejectsUnclassified(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await writeFile(join(root, 'packages/zag/tests/new-case.test.ts'), 'export {};\n');
	assert.throws(function run() {
		verifyZagTestClassifications(root);
	}, /exactly one classification/);
});

test('rejects a parity classification without an oracle', async function rejectsMissingOracle(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/zag/audit/test-classifications.json');
	const config = JSON.parse(await readFile(path, 'utf8'));
	delete config.tests.find(function findAdapted(entry) {
		return entry.disposition === 'adapted-upstream-suite';
	}).oracle;
	await writeFile(path, `${JSON.stringify(config)}\n`);
	assert.throws(function run() {
		verifyZagTestClassifications(root);
	}, /requires oracle/);
});
