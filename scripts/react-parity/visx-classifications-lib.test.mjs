import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { verifyVisxTestClassifications } from './visx-classifications-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'visx-classifications-'));
	await cp(
		new URL('../../packages/visx/tests', import.meta.url),
		join(root, 'packages/visx/tests'),
		{ recursive: true },
	);
	await cp(
		new URL('../../packages/visx/typetests', import.meta.url),
		join(root, 'packages/visx/typetests'),
		{ recursive: true },
	);
	for (const file of ['test-classifications.json', 'react-parity.json']) {
		await cp(
			new URL(`../../packages/visx/audit/${file}`, import.meta.url),
			join(root, `packages/visx/audit/${file}`),
			{ recursive: true },
		);
	}
	return root;
}

test('rejects an unclassified port-authored runtime test', async function rejectsUnclassified(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await writeFile(join(root, 'packages/visx/tests/new.test.ts'), 'export {};\n');
	assert.throws(function run() {
		verifyVisxTestClassifications(root);
	}, /exactly one classification/);
});

test('rejects an unclassified typetests probe', async function rejectsUnclassifiedTypetestsProbe(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await mkdir(join(root, 'packages/visx/typetests/extra'), { recursive: true });
	await writeFile(join(root, 'packages/visx/typetests/extra/new.test-d.ts'), 'export {};\n');
	assert.throws(function run() {
		verifyVisxTestClassifications(root);
	}, /exactly one classification/);
});

test('rejects an unclassified tests/types probe', async function rejectsUnclassifiedTestsTypesProbe(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await mkdir(join(root, 'packages/visx/tests/types'), { recursive: true });
	await writeFile(join(root, 'packages/visx/tests/types/extra.test-d.ts'), 'export {};\n');
	assert.throws(function run() {
		verifyVisxTestClassifications(root);
	}, /exactly one classification/);
});

test('rejects a parity classification without an oracle', async function rejectsMissingOracle(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/visx/audit/test-classifications.json');
	const config = JSON.parse(await readFile(path, 'utf8'));
	delete config.tests.find(function findDifferential(entry) {
		return entry.disposition === 'react-octane-differential';
	}).oracle;
	await writeFile(path, `${JSON.stringify(config)}\n`);
	assert.throws(function run() {
		verifyVisxTestClassifications(root);
	}, /requires a React oracle/);
});

test('rejects an Octane-only classification that claims an oracle', async function rejectsOracle(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/visx/audit/test-classifications.json');
	const config = JSON.parse(await readFile(path, 'utf8'));
	config.tests.find(function findOctaneOnly(entry) {
		return entry.disposition === 'octane-only-framework-contract';
	}).oracle = 'must not claim parity';
	await writeFile(path, `${JSON.stringify(config)}\n`);
	assert.throws(function run() {
		verifyVisxTestClassifications(root);
	}, /must not claim React parity/);
});
