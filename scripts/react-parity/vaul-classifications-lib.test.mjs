import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { verifyVaulTestClassifications } from './vaul-classifications-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'vaul-classifications-'));
	await cp(
		new URL('../../packages/vaul/tests', import.meta.url),
		join(root, 'packages/vaul/tests'),
		{ recursive: true },
	);
	for (const file of ['test-classifications.json', 'react-parity.json']) {
		await cp(
			new URL(`../../packages/vaul/audit/${file}`, import.meta.url),
			join(root, `packages/vaul/audit/${file}`),
			{ recursive: true },
		);
	}
	await cp(new URL('../../vitest.config.js', import.meta.url), join(root, 'vitest.config.js'));
	for (const file of [
		'vaul-classifications-lib.test.mjs',
		'vaul-runtime-lib.test.mjs',
		'vaul-upstream-lib.test.mjs',
	]) {
		await cp(new URL(`./${file}`, import.meta.url), join(root, `scripts/react-parity/${file}`));
	}
	return root;
}

test('rejects an unclassified port-authored vaul test', async function rejectsUnclassified(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await writeFile(join(root, 'packages/vaul/tests/new.test.ts'), 'export {};\n');
	assert.throws(function run() {
		verifyVaulTestClassifications(root);
	}, /exactly one classification/);
});

test('rejects a parity classification without an oracle', async function rejectsMissingOracle(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/vaul/audit/test-classifications.json');
	const config = JSON.parse(await readFile(path, 'utf8'));
	delete config.tests.find(function findAdapted(entry) {
		return entry.disposition === 'adapted-upstream-suite';
	}).oracle;
	await writeFile(path, `${JSON.stringify(config)}\n`);
	assert.throws(function run() {
		verifyVaulTestClassifications(root);
	}, /requires a React oracle/);
});

test('rejects an Octane-only classification that claims an oracle', async function rejectsOracle(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/vaul/audit/test-classifications.json');
	const config = JSON.parse(await readFile(path, 'utf8'));
	config.tests.find(function findOctaneOnly(entry) {
		return entry.disposition === 'octane-only-framework-contract';
	}).oracle = 'must not claim parity';
	await writeFile(path, `${JSON.stringify(config)}\n`);
	assert.throws(function run() {
		verifyVaulTestClassifications(root);
	}, /must not claim React parity/);
});

test('rejects an unclassified type probe under tests/types', async function rejectsUnclassifiedType(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await writeFile(join(root, 'packages/vaul/tests/types/extra.ts'), 'export {};\n');
	assert.throws(function run() {
		verifyVaulTestClassifications(root);
	}, /exactly one classification/);
});

test('rejects Octane-only ownership drift into the react-parity include set', async function rejectsOwnershipDrift(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const vitestPath = join(root, 'vitest.config.js');
	const source = await readFile(vitestPath, 'utf8');
	const drifted = source.replace(
		"include: ['packages/vaul/tests/drawer.test.ts'],",
		"include: ['packages/vaul/tests/drawer.test.ts', 'packages/vaul/tests/exports.test.ts'],",
	);
	assert.notEqual(drifted, source);
	await writeFile(vitestPath, drifted);
	assert.throws(function run() {
		verifyVaulTestClassifications(root);
	}, /must not be owned by a react-parity lane/);
});

test('rejects an unclassified script-side Vaul audit test', async function rejectsUnclassifiedAudit(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await writeFile(join(root, 'scripts/react-parity/vaul-extra-lib.test.mjs'), 'export {};\n');
	assert.throws(function run() {
		verifyVaulTestClassifications(root);
	}, /exactly one classification/);
});
