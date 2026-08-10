import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
	discoverReactTextareaAutosizeClassifiedPaths,
	verifyReactTextareaAutosizeTestClassifications,
} from './react-textarea-autosize-classifications-lib.mjs';
import { verifyReactTextareaAutosizeCrosswalk } from './react-textarea-autosize-crosswalk-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

function readJson(relativePath) {
	return JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
}

test('textarea-autosize classifies every port-authored runtime/type test exactly once', function classifiesExactlyOnce() {
	assert.deepEqual(verifyReactTextareaAutosizeTestClassifications(root), {
		tests: discoverReactTextareaAutosizeClassifiedPaths(root).length,
	});
});

test('rejects an unclassified port-authored textarea-autosize test', async function rejectsUnclassified(
	t,
) {
	const fixtureRoot = await mkdtemp(join(tmpdir(), 'textarea-classifications-'));
	t.after(function cleanup() {
		return rm(fixtureRoot, { recursive: true, force: true });
	});
	await cp(
		join(root, 'packages/textarea-autosize/tests'),
		join(fixtureRoot, 'packages/textarea-autosize/tests'),
		{ recursive: true },
	);
	await cp(
		join(root, 'packages/textarea-autosize/audit'),
		join(fixtureRoot, 'packages/textarea-autosize/audit'),
		{ recursive: true },
	);
	await cp(
		join(root, 'packages/textarea-autosize/typetests'),
		join(fixtureRoot, 'packages/textarea-autosize/typetests'),
		{ recursive: true },
	);
	await writeFile(
		join(fixtureRoot, 'packages/textarea-autosize/tests/new.test.ts'),
		'export {};\n',
	);
	assert.throws(function run() {
		verifyReactTextareaAutosizeTestClassifications(fixtureRoot);
	}, /exactly one classification/);
});

test('pristine→adapted crosswalk is exhaustive one-for-one', function exhaustiveCrosswalk() {
	assert.deepEqual(verifyReactTextareaAutosizeCrosswalk(root), { cases: 2 });
});

test('removing a crosswalk mapping fails verification', function rejectsRemovedMapping() {
	const crosswalk = readJson('packages/textarea-autosize/audit/upstream-crosswalk.json');
	assert.throws(function run() {
		verifyReactTextareaAutosizeCrosswalk(root, {
			crosswalk: { ...crosswalk, cases: crosswalk.cases.slice(1) },
		});
	}, /case count must match pristine inventory|has no crosswalk mapping/);
});

test('renaming an adapted inventory identity fails verification', function rejectsRenamedIdentity() {
	const adapted = readJson('packages/textarea-autosize/audit/adapted-runtime.json');
	assert.throws(function run() {
		verifyReactTextareaAutosizeCrosswalk(root, {
			adapted: {
				...adapted,
				tests: adapted.tests.map(function renameFirst(testCase, index) {
					if (index !== 0) return testCase;
					return { ...testCase, fullName: `${testCase.fullName} renamed` };
				}),
			},
		});
	}, /missing from adapted inventory|has no crosswalk mapping/);
});

test('stale adapted source path in the crosswalk fails verification', function rejectsStalePath() {
	const crosswalk = readJson('packages/textarea-autosize/audit/upstream-crosswalk.json');
	assert.throws(function run() {
		verifyReactTextareaAutosizeCrosswalk(root, {
			crosswalk: {
				...crosswalk,
				cases: crosswalk.cases.map(function poison(entry, index) {
					if (index !== 0) return entry;
					return {
						...entry,
						adaptedFile: 'packages/textarea-autosize/tests/missing.test.ts',
					};
				}),
			},
		});
	}, /adaptedFile missing from adapted inventory files/);
});

test('weakening an adapted assertion without changing identity fails verification', function rejectsWeakenedAssertion() {
	const adaptedFile = 'packages/textarea-autosize/tests/upstream/adapted.test.ts';
	const source = readFileSync(join(root, adaptedFile), 'utf8');
	const weakened = source.replace(
		"expect(app.html()).toBe('<textarea></textarea>');",
		"expect(app.html()).toBe('<textarea>weakened</textarea>');",
	);
	assert.notEqual(weakened, source, 'fixture must change adapted assertion source');
	assert.throws(function run() {
		verifyReactTextareaAutosizeCrosswalk(root, {
			adaptedSources: {
				[adaptedFile]: weakened,
			},
		});
	}, /adapted assertion source drifted from crosswalk lock/);
});

test('omitting an adapted inventory identity fails verification', function rejectsOmittedIdentity() {
	const adapted = readJson('packages/textarea-autosize/audit/adapted-runtime.json');
	assert.throws(function run() {
		verifyReactTextareaAutosizeCrosswalk(root, {
			adapted: { ...adapted, tests: adapted.tests.slice(1) },
		});
	}, /case count must match adapted inventory|missing from adapted inventory/);
});

test('skipping an adapted inventory file entry fails verification', function rejectsSkippedFileEntry() {
	const adapted = readJson('packages/textarea-autosize/audit/adapted-runtime.json');
	assert.throws(function run() {
		verifyReactTextareaAutosizeCrosswalk(root, {
			adapted: { ...adapted, files: [] },
		});
	}, /adaptedFile missing from adapted inventory files/);
});

test('non-ported crosswalk status fails verification', function rejectsNonPortedStatus() {
	const crosswalk = readJson('packages/textarea-autosize/audit/upstream-crosswalk.json');
	assert.throws(function run() {
		verifyReactTextareaAutosizeCrosswalk(root, {
			crosswalk: {
				...crosswalk,
				cases: crosswalk.cases.map(function skipFirst(entry, index) {
					if (index !== 0) return entry;
					return { ...entry, status: 'skipped' };
				}),
			},
		});
	}, /crosswalk status must be ported/);
});
