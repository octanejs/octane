import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { verifyReactResizablePanelsTestClassifications } from './react-resizable-panels-classifications-lib.mjs';

const repo = join(import.meta.dirname, '../..');

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'rrp-classifications-'));
	cpSync(
		join(repo, 'packages/resizable-panels/tests'),
		join(root, 'packages/resizable-panels/tests'),
		{ recursive: true },
	);
	mkdirSync(join(root, 'scripts/react-parity'), { recursive: true });
	mkdirSync(join(root, 'packages/resizable-panels/audit'), { recursive: true });
	for (const name of [
		'react-resizable-panels-classifications-lib.test.mjs',
		'react-resizable-panels-runtime-lib.test.mjs',
		'react-resizable-panels-types-lib.test.mjs',
		'react-resizable-panels-upstream-lib.test.mjs',
	]) {
		cpSync(join(repo, 'scripts/react-parity', name), join(root, 'scripts/react-parity', name));
	}
	for (const file of ['test-classifications.json', 'react-parity.json', 'test-inventory.json']) {
		cpSync(
			join(repo, 'packages/resizable-panels/audit', file),
			join(root, 'packages/resizable-panels/audit', file),
		);
	}
	return root;
}

test('accepts the pinned port-authored and adapted upstream sets', function acceptsPinned() {
	const result = verifyReactResizablePanelsTestClassifications(repo);
	assert.equal(result.tests, 11);
	assert.equal(result.adaptedUpstreamSuites, 29);
});

test('rejects an extra adapted upstream file absent from inventory adaptedPath', async function rejectsExtra(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await writeFile(
		join(root, 'packages/resizable-panels/tests/upstream/extra-unlisted.test.ts'),
		"test('unlisted', () => {})\n",
	);
	assert.throws(function run() {
		verifyReactResizablePanelsTestClassifications(root);
	}, /adaptedPath set/);
});

test('rejects an unclassified scripts/react-parity audit test', async function rejectsUnclassifiedScript(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await mkdir(join(root, 'scripts/react-parity'), { recursive: true });
	await writeFile(
		join(root, 'scripts/react-parity/react-resizable-panels-extra-lib.test.mjs'),
		"import test from 'node:test';\ntest('extra', function noop() {});\n",
	);
	assert.throws(function run() {
		verifyReactResizablePanelsTestClassifications(root);
	}, /exactly one classification/);
	const configPath = join(root, 'packages/resizable-panels/audit/test-classifications.json');
	const config = JSON.parse(readFileSync(configPath, 'utf8'));
	config.tests = config.tests.filter(function keepPackage(entry) {
		return !entry.path.startsWith('scripts/react-parity/');
	});
	writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
	assert.throws(function run() {
		verifyReactResizablePanelsTestClassifications(root);
	}, /exactly one classification/);
});
