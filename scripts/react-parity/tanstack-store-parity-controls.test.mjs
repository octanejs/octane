import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inventoryFromIdentities } from './tanstack-store-pristine-runtime.mjs';
import {
	compareAdaptedRuntimeAssertions,
	verifyTanstackStoreUpstreamEvidence,
} from './tanstack-store-upstream-lib.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ADAPTED_FIXTURE = 'packages/tanstack-store/tests/_fixtures/upstream/index.tsrx';
const UPSTREAM_TEST = 'packages/tanstack-store/upstream/tests/index.test.tsx';

function read(relativePath) {
	return readFileSync(join(REPO, relativePath), 'utf8');
}

test('verifyTanstackStoreUpstreamEvidence rejects vendored byte drift', () => {
	const path = join(REPO, 'packages/tanstack-store/upstream/SHA256SUMS');
	const original = readFileSync(path, 'utf8');
	const corrupted = `${original.replace(/^([0-9a-f]{64})/m, '0'.repeat(64))}`;
	try {
		writeFileSync(path, corrupted);
		assert.throws(function verifyCorrupted() {
			verifyTanstackStoreUpstreamEvidence(REPO);
		}, /Vendored byte drift|file inventory differs/);
	} finally {
		writeFileSync(path, original);
	}
});

test('adapted inventory preserves every selected pristine identity one-for-one', () => {
	const pristine = JSON.parse(read('packages/tanstack-store/audit/pristine-runtime.json'));
	const adapted = JSON.parse(read('packages/tanstack-store/audit/adapted-runtime.json'));
	const adaptedNames = new Set(
		adapted.tests.map(function name(testCase) {
			return testCase.fullName;
		}),
	);
	const missing = pristine.tests
		.map(function name(testCase) {
			return testCase.fullName;
		})
		.filter(function absent(fullName) {
			return !fullName.startsWith('_useStore ') && !adaptedNames.has(fullName);
		});
	assert.deepEqual(
		missing,
		[],
		`adapted suite omitted pristine identities:\n${missing.join('\n')}`,
	);
});

test('omitting an inventoried pristine identity fails inventory validation', () => {
	const inventory = JSON.parse(read('packages/tanstack-store/audit/pristine-runtime.json'));
	assert.ok(inventory.tests.length > 1, 'pristine inventory must contain multiple identities');
	const omitted = inventory.tests.slice(1);
	const rebuilt = inventoryFromIdentities(
		omitted.map(function asPassed(testCase) {
			return { ...testCase, status: 'passed' };
		}),
	);
	assert.notDeepEqual(rebuilt.tests, inventory.tests);
});

test('renaming an inventoried pristine identity fails inventory validation', () => {
	const inventory = JSON.parse(read('packages/tanstack-store/audit/pristine-runtime.json'));
	const renamed = inventory.tests.map(function renameFirst(testCase, index) {
		if (index !== 0) return { ...testCase, status: 'passed' };
		return { ...testCase, fullName: `${testCase.fullName} (renamed)`, status: 'passed' };
	});
	const rebuilt = inventoryFromIdentities(renamed);
	assert.notDeepEqual(
		rebuilt.tests.map(function name(testCase) {
			return testCase.fullName;
		}),
		inventory.tests.map(function name(testCase) {
			return testCase.fullName;
		}),
	);
});

test('executable upstream verifier accepts the committed tanstack-store evidence', () => {
	assert.deepEqual(verifyTanstackStoreUpstreamEvidence(REPO), {
		upstreamCases: 32,
		adaptedCases: 30,
		omittedCases: 2,
		assertionGroups: 62,
		permittedTransformations: 5,
	});
});

test('deleting an adapted runtime assertion fails the source-level crosswalk', () => {
	const upstream = read(UPSTREAM_TEST);
	const adapted = read(ADAPTED_FIXTURE);
	const mutated = adapted.replace(
		'expect(result.current).toBe(atom);\n\t\texpect(result.current.get()).toBe(1);',
		'expect(result.current).toBe(atom);',
	);
	assert.notEqual(mutated, adapted);
	assert.throws(function deletedAssertion() {
		compareAdaptedRuntimeAssertions(upstream, mutated);
	}, /assertions drifted/);
});

test('changing an adapted runtime assertion fails the source-level crosswalk', () => {
	const upstream = read(UPSTREAM_TEST);
	const adapted = read(ADAPTED_FIXTURE);
	const mutated = adapted.replace(
		'expect(result.current.get()).toBe(1);',
		'expect(result.current.get()).toBe(999);',
	);
	assert.notEqual(mutated, adapted);
	assert.throws(function changedAssertion() {
		compareAdaptedRuntimeAssertions(upstream, mutated);
	}, /assertions drifted/);
});

test('rewriting adapted setup outside permitted transforms fails the structural gate', () => {
	const upstream = read(UPSTREAM_TEST);
	const adapted = read(ADAPTED_FIXTURE);
	const mutated = adapted.replace('const atom = createAtom(0);', 'const atom = createAtom(42);');
	assert.notEqual(mutated, adapted);
	assert.throws(function changedBody() {
		compareAdaptedRuntimeAssertions(upstream, mutated);
	}, /outside the permitted transformations|assertions drifted/);
});
