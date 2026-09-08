import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { verifyReactTransitionGroupTestClassifications } from './react-transition-group-classifications-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'rtg-classifications-'));
	await cp(
		new URL('../../packages/transition-group/tests', import.meta.url),
		join(root, 'packages/transition-group/tests'),
		{ recursive: true },
	);
	await cp(
		new URL('../../packages/transition-group/upstream-types', import.meta.url),
		join(root, 'packages/transition-group/upstream-types'),
		{ recursive: true },
	);
	await cp(
		new URL('../../packages/transition-group/typetests', import.meta.url),
		join(root, 'packages/transition-group/typetests'),
		{ recursive: true },
	);
	await mkdir(join(root, 'scripts/react-parity'), { recursive: true });
	for (const file of [
		'react-transition-group-classifications-lib.test.mjs',
		'react-transition-group-timer-order.test.mjs',
		'react-transition-group-types-lib.test.mjs',
		'react-transition-group-upstream-lib.test.mjs',
	]) {
		await cp(new URL(`./${file}`, import.meta.url), join(root, `scripts/react-parity/${file}`));
	}
	for (const file of ['test-classifications.json', 'react-parity.json']) {
		await mkdir(join(root, 'packages/transition-group/audit'), { recursive: true });
		await cp(
			new URL(`../../packages/transition-group/audit/${file}`, import.meta.url),
			join(root, `packages/transition-group/audit/${file}`),
		);
	}
	return root;
}

test('rejects an unclassified port-authored test', async function rejectsUnclassified(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await writeFile(join(root, 'packages/transition-group/tests/new.test.ts'), 'export {};\n');
	assert.throws(function run() {
		verifyReactTransitionGroupTestClassifications(root);
	}, /exactly one classification/);
});

test('rejects an unclassified type probe', async function rejectsUnclassifiedTypeProbe(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await writeFile(
		join(root, 'packages/transition-group/typetests/extra.test-d.ts'),
		'export {};\n',
	);
	assert.throws(function run() {
		verifyReactTransitionGroupTestClassifications(root);
	}, /exactly one classification/);
});

test('rejects a parity classification without an oracle', async function rejectsMissingOracle(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/transition-group/audit/test-classifications.json');
	const config = JSON.parse(await readFile(path, 'utf8'));
	delete config.tests.find(function findDifferential(entry) {
		return entry.disposition === 'unmodified-upstream-suite-wrapper';
	}).oracle;
	await writeFile(path, `${JSON.stringify(config)}\n`);
	assert.throws(function run() {
		verifyReactTransitionGroupTestClassifications(root);
	}, /requires a React oracle/);
});

test('rejects an Octane-only classification that claims an oracle', async function rejectsOracle(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/transition-group/audit/test-classifications.json');
	const config = JSON.parse(await readFile(path, 'utf8'));
	config.tests.find(function findOctaneOnly(entry) {
		return entry.disposition === 'octane-only-framework-contract';
	}).oracle = 'must not claim parity';
	await writeFile(path, `${JSON.stringify(config)}\n`);
	assert.throws(function run() {
		verifyReactTransitionGroupTestClassifications(root);
	}, /must not claim React parity/);
});
