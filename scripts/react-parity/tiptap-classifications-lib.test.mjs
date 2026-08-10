import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyTiptapTestClassifications } from './tiptap-classifications-lib.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'tiptap-classifications-'));
	await cp(join(REPO, 'packages/tiptap/tests'), join(root, 'packages/tiptap/tests'), {
		recursive: true,
	});
	await cp(join(REPO, 'packages/tiptap/typetests'), join(root, 'packages/tiptap/typetests'), {
		recursive: true,
	});
	await mkdir(join(root, 'packages/tiptap/audit'), { recursive: true });
	for (const file of ['test-classifications.json', 'react-parity.json']) {
		await cp(join(REPO, `packages/tiptap/audit/${file}`), join(root, `packages/tiptap/audit/${file}`));
	}
	return root;
}

test('verifies the committed tiptap classification ledger', function verifiesCommitted() {
	const result = verifyTiptapTestClassifications(REPO);
	assert.ok(result.tests >= 19, `expected tests+type probes, got ${result.tests}`);
});

test('rejects an unclassified type probe', async function rejectsUnclassifiedType(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await writeFile(join(root, 'packages/tiptap/typetests/unclassified.test-d.ts'), 'export {};\n');
	assert.throws(function run() {
		verifyTiptapTestClassifications(root);
	}, /exactly one classification/);
});

test('rejects a multiply classified type probe', async function rejectsMultiplyClassified(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/tiptap/audit/test-classifications.json');
	const config = JSON.parse(await readFile(path, 'utf8'));
	config.tests.push({
		path: 'packages/tiptap/typetests/public-api.test-d.ts',
		disposition: 'octane-only-type-probe',
		reason: 'duplicate',
	});
	await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
	assert.throws(function run() {
		verifyTiptapTestClassifications(root);
	}, /exactly one classification/);
});
