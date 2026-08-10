import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
	assertPristineAdaptedCrosswalk,
	loadZagRuntimeCaseDispositions,
	normalizedIdentityKey,
	verifyZagRuntimeCrosswalk,
} from './zag-runtime-crosswalk.mjs';
import { assertZagAdaptedSourceCrosswalk } from '../../packages/zag/scripts/verify-upstream.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readInventory(relativePath) {
	return JSON.parse(readFileSync(resolve(REPO, relativePath), 'utf8'));
}

test('committed zag inventories satisfy the pristine→adapted crosswalk', () => {
	const summary = verifyZagRuntimeCrosswalk(REPO);
	assert.equal(summary.pristine, 40);
	assert.equal(summary.adapted, 36);
	assert.equal(summary.dispositioned, 4);
});

test('case dispositions record the exact StrictMode pristine identities', () => {
	const pristine = readInventory('packages/zag/audit/pristine-runtime.json');
	const dispositions = loadZagRuntimeCaseDispositions(REPO);
	const strict = pristine.tests.filter(function keepStrict(test) {
		return test.file.endsWith('/strict-mode.test.tsx');
	});
	assert.equal(strict.length, 4);
	assert.deepEqual(
		dispositions.cases
			.map(function idOf(entry) {
				return entry.id;
			})
			.sort(),
		strict
			.map(function idOf(test) {
				return test.id;
			})
			.sort(),
	);
});

test('omitting a portable adapted identity fails the crosswalk', () => {
	const pristine = readInventory('packages/zag/audit/pristine-runtime.json');
	const adapted = readInventory('packages/zag/audit/adapted-runtime.json');
	const dispositions = loadZagRuntimeCaseDispositions(REPO);
	assert.throws(function omit() {
		assertPristineAdaptedCrosswalk({
			pristine,
			adapted: { ...adapted, tests: adapted.tests.slice(1) },
			dispositions,
		});
	}, /missing one-for-one counterparts/);
});

test('renaming a portable adapted identity fails the crosswalk', () => {
	const pristine = readInventory('packages/zag/audit/pristine-runtime.json');
	const adapted = readInventory('packages/zag/audit/adapted-runtime.json');
	const dispositions = loadZagRuntimeCaseDispositions(REPO);
	const renamed = {
		...adapted,
		tests: adapted.tests.map(function renameFirst(test, index) {
			if (index !== 0) return test;
			return { ...test, fullName: `${test.fullName} (renamed)` };
		}),
	};
	assert.throws(function rename() {
		assertPristineAdaptedCrosswalk({ pristine, adapted: renamed, dispositions });
	}, /missing one-for-one counterparts/);
});

test('skipping a portable adapted identity fails the crosswalk', () => {
	const pristine = readInventory('packages/zag/audit/pristine-runtime.json');
	const adapted = readInventory('packages/zag/audit/adapted-runtime.json');
	const dispositions = loadZagRuntimeCaseDispositions(REPO);
	const skippedKey = normalizedIdentityKey(adapted.tests[0]);
	const skipped = {
		...adapted,
		tests: adapted.tests.filter(function keep(test) {
			return normalizedIdentityKey(test) !== skippedKey;
		}),
	};
	assert.throws(function skip() {
		assertPristineAdaptedCrosswalk({ pristine, adapted: skipped, dispositions });
	}, /missing one-for-one counterparts/);
});

test('dropping a StrictMode disposition fails the crosswalk', () => {
	const pristine = readInventory('packages/zag/audit/pristine-runtime.json');
	const adapted = readInventory('packages/zag/audit/adapted-runtime.json');
	const dispositions = loadZagRuntimeCaseDispositions(REPO);
	assert.throws(function dropDisposition() {
		assertPristineAdaptedCrosswalk({
			pristine,
			adapted,
			dispositions: { ...dispositions, cases: dispositions.cases.slice(1) },
		});
	}, /missing one-for-one counterparts/);
});

test('committed adapted sources match pristine after allowed transforms', function sourceCrosswalk() {
	const summary = assertZagAdaptedSourceCrosswalk(resolve(REPO, 'packages/zag'));
	assert.equal(summary.pairs, 3);
});

test('deleting an adapted assertion fails the source crosswalk', function assertionDriftRejected() {
	const root = mkdtempSync(join(tmpdir(), 'zag-adapted-source-'));
	try {
		cpSync(resolve(REPO, 'packages/zag/upstream'), join(root, 'upstream'), { recursive: true });
		cpSync(resolve(REPO, 'packages/zag/tests/upstream'), join(root, 'tests/upstream'), {
			recursive: true,
		});
		cpSync(
			resolve(REPO, 'packages/zag/audit/adapted-transformations.json'),
			join(root, 'audit/adapted-transformations.json'),
		);
		const adaptedPath = join(root, 'tests/upstream/machine.test.ts');
		const source = readFileSync(adaptedPath, 'utf8');
		const mutated = source.replace(
			/expect\(result\.current\.state\.get\(\)\)\.toBe\('foo'\);/,
			'expect(true).toBe(true);',
		);
		assert.notEqual(mutated, source);
		writeFileSync(adaptedPath, mutated);
		assert.throws(function alteredAssertion() {
			assertZagAdaptedSourceCrosswalk(root);
		}, /assertion\/fixture hash mismatch/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
