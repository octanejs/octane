import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { planAdaptedFiles, validateUpstreamLock } from '../react-port/materialize-lib.mjs';
import {
	assertPristineAdaptedCrosswalk,
	loadZagRuntimeCaseDispositions,
	normalizedIdentityKey,
	verifyZagRuntimeCrosswalk,
} from './zag-runtime-crosswalk.mjs';

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

test('committed zag lock and patch set cover the pinned adapted surface', function lockCoverage() {
	const lock = validateUpstreamLock(
		JSON.parse(readFileSync(resolve(REPO, 'packages/zag/audit/upstream.lock.json'), 'utf8')),
	);
	assert.equal(lock.identity.packageName, '@zag-js/react');
	assert.equal(lock.identity.version, '1.42.0');
	const planned = planAdaptedFiles(lock);
	assert.deepEqual(
		planned.map(function targetOf(entry) {
			return entry.targetPath;
		}),
		[
			'tests/upstream/machine.test.ts',
			'tests/upstream/nested-states.test.ts',
			'tests/upstream/render.ts',
			'tests/upstream/strict-mode.test.tsx',
		],
	);
	// The lock's mechanical rewrites cover zag's whole adaptation, so a mapped
	// file normally carries no patch at all: it regenerates as pristine bytes
	// plus rewrites. A file may carry a divergence patch or a skip rationale,
	// never both, and the pinned StrictMode suite must stay dispositioned out.
	const patchesRoot = resolve(REPO, 'packages/zag/audit/upstream-patches');
	for (const entry of planned) {
		const hasPatch = existsSync(resolve(patchesRoot, `${entry.targetPath}.patch`));
		const hasSkip = existsSync(resolve(patchesRoot, `${entry.targetPath}.skip`));
		assert.ok(
			!(hasPatch && hasSkip),
			`${entry.targetPath} cannot have both a patch and a skip rationale`,
		);
	}
	assert.ok(
		existsSync(resolve(patchesRoot, 'tests/upstream/strict-mode.test.tsx.skip')),
		'the StrictMode suite must keep its committed skip rationale',
	);
	assert.deepEqual(
		lock.adaptedRewrites.map(function findOf(rewrite) {
			return rewrite.find;
		}),
		['"@testing-library/react"', 'from "../src"'],
	);
});

test('tampering the committed zag lock fails validation', function lockTamperRejected() {
	const lock = JSON.parse(
		readFileSync(resolve(REPO, 'packages/zag/audit/upstream.lock.json'), 'utf8'),
	);
	lock.files[0].gitBlob = 'f'.repeat(40);
	assert.throws(function tampered() {
		validateUpstreamLock(lock);
	}, /fingerprint does not match/);
});
