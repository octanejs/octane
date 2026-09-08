import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { verifyIntersectionObserverTestClassifications } from './intersection-observer-classifications-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'intersection-observer-classifications-'));
	await cp(
		new URL('../../packages/intersection-observer/tests', import.meta.url),
		join(root, 'packages/intersection-observer/tests'),
		{ recursive: true },
	);
	for (const file of ['test-classifications.json', 'react-parity.json']) {
		await cp(
			new URL(`../../packages/intersection-observer/audit/${file}`, import.meta.url),
			join(root, `packages/intersection-observer/audit/${file}`),
			{ recursive: true },
		);
	}
	return root;
}

test('rejects an unclassified port-authored test', async function rejectsUnclassified(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await writeFile(join(root, 'packages/intersection-observer/tests/new.test.ts'), 'export {};\n');
	assert.throws(function run() {
		verifyIntersectionObserverTestClassifications(root);
	}, /exactly one classification/);
});

test('rejects a parity classification without an oracle', async function rejectsMissingOracle(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/intersection-observer/audit/test-classifications.json');
	const config = JSON.parse(await readFile(path, 'utf8'));
	delete config.tests.find(function findWrapper(entry) {
		return entry.disposition === 'unmodified-upstream-suite-wrapper';
	}).oracle;
	await writeFile(path, `${JSON.stringify(config)}\n`);
	assert.throws(function run() {
		verifyIntersectionObserverTestClassifications(root);
	}, /requires a React oracle/);
});

test('rejects an Octane-only classification that claims an oracle', async function rejectsOracle(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/intersection-observer/audit/test-classifications.json');
	const config = JSON.parse(await readFile(path, 'utf8'));
	config.tests.find(function findOctaneOnly(entry) {
		return entry.disposition === 'octane-only-framework-contract';
	}).oracle = 'must not claim parity';
	await writeFile(path, `${JSON.stringify(config)}\n`);
	assert.throws(function run() {
		verifyIntersectionObserverTestClassifications(root);
	}, /must not claim React parity/);
});

test('rejects a multiply classified test path', async function rejectsDuplicate(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/intersection-observer/audit/test-classifications.json');
	const config = JSON.parse(await readFile(path, 'utf8'));
	config.tests.push({ ...config.tests[0] });
	await writeFile(path, `${JSON.stringify(config)}\n`);
	assert.throws(function run() {
		verifyIntersectionObserverTestClassifications(root);
	}, /exactly one classification/);
});
