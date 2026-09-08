import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	buildInventory,
	compareInventories,
	verifyReactColorfulUpstream,
} from './react-colorful-upstream-lib.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const clone = function clone(value) {
	return structuredClone(value);
};

test('the pinned upstream inventory validates through the always-on control plane', async function validatesLive() {
	const result = await verifyReactColorfulUpstream(REPO);
	assert.equal(result.artifacts, 72);
	assert.equal(result.upstreamCases, 64);
});

test('fails closed when an upstream artifact is missing', async function rejectsMissingArtifact() {
	const actual = await buildInventory(resolve(REPO, 'packages/colorful'));
	const expected = clone(actual);
	expected.artifacts.pop();
	assert.throws(function run() {
		compareInventories(actual, expected);
	}, /artifact inventory/);
});

test('fails closed when an upstream artifact checksum is stale', async function rejectsStaleChecksum() {
	const actual = await buildInventory(resolve(REPO, 'packages/colorful'));
	const expected = clone(actual);
	expected.artifacts[0].sha256 = '0'.repeat(64);
	assert.throws(function run() {
		compareInventories(actual, expected);
	}, /artifact inventory/);
});

test('fails closed when an upstream case is renamed or missing', async function rejectsRenamedCase() {
	const actual = await buildInventory(resolve(REPO, 'packages/colorful'));
	const expected = clone(actual);
	expected.upstreamCases[0].name += ' renamed';
	assert.throws(function run() {
		compareInventories(actual, expected);
	}, /case inventory/);
});

test('fails closed when a case mapping is duplicated or changed', async function rejectsChangedMapping() {
	const actual = await buildInventory(resolve(REPO, 'packages/colorful'));
	const expected = clone(actual);
	expected.crosswalk[0].evidence = 'tests/runtime/missing.test.ts::duplicate';
	assert.throws(function run() {
		compareInventories(actual, expected);
	}, /crosswalk/);
});

test('fails closed when an adapted case body is weakened without changing its title', async function rejectsWeakenedBody(t) {
	const root = await mkdtemp(join(tmpdir(), 'react-colorful-upstream-'));
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await cp(new URL('../../packages/colorful', import.meta.url), join(root, 'packages/colorful'), {
		recursive: true,
	});
	const packageRoot = join(root, 'packages/colorful');
	const baseline = await buildInventory(packageRoot);
	const evidence = baseline.crosswalk[0].evidence;
	const split = evidence.lastIndexOf('::');
	const path = evidence.slice(0, split);
	const file = join(packageRoot, path);
	const source = await readFile(file, 'utf8');
	const weakened = source.replace(/\n\s*expect\([^;]+;/m, '\n\texpect(true).toBe(true);\n');
	assert.notEqual(weakened, source, 'fixture mutation must alter the adapted body');
	await writeFile(file, weakened);
	const mutated = await buildInventory(packageRoot);
	assert.throws(function run() {
		compareInventories(mutated, baseline);
	}, /crosswalk/);
});
