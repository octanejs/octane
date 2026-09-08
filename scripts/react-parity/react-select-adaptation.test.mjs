import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAdaptationInventory } from './react-select-adaptation.mjs';

const suiteNames = ['Async', 'AsyncCreatable', 'Creatable', 'Select', 'StateManaged'];

function pristineFixture() {
	const tests = [];
	for (let index = 0; index < 255; index += 1) {
		tests.push({
			file: `src/__tests__/${suiteNames[index % suiteNames.length]}.test.tsx`,
			fullName: `upstream case ${index}`,
			status: 'passed',
		});
	}
	return { tests };
}

function adaptedFixture() {
	const pristine = pristineFixture();
	return {
		tests: pristine.tests.map(function adaptedCase(entry) {
			return {
				file: `packages/select/tests/upstream/${basenameFor(entry.file)}.test.ts`,
				fullName: entry.fullName,
			};
		}),
	};
}

function basenameFor(file) {
	return file.slice(file.lastIndexOf('/') + 1, -'.test.tsx'.length);
}

test('rejects a removed pristine identity', function rejectsRemovedPristineIdentity() {
	const pristine = pristineFixture();
	pristine.tests.pop();
	assert.throws(function buildInvalidInventory() {
		buildAdaptationInventory(pristine, adaptedFixture());
	}, /Expected 255 pristine cases/);
});

test('rejects a removed adapted identity', function rejectsRemovedAdaptedIdentity() {
	const adapted = adaptedFixture();
	adapted.tests.pop();
	assert.throws(function buildInvalidInventory() {
		buildAdaptationInventory(pristineFixture(), adapted);
	}, /Expected 255 adapted cases/);
});

test('rejects a renamed adapted identity', function rejectsRenamedAdaptedIdentity() {
	const adapted = adaptedFixture();
	adapted.tests[0].fullName = 'renamed upstream case';
	assert.throws(function buildInvalidInventory() {
		buildAdaptationInventory(pristineFixture(), adapted);
	}, /has no pristine identity/);
});

test('rejects a stale adapted source path', function rejectsStaleAdaptedPath() {
	const adapted = adaptedFixture();
	adapted.tests[0].file = 'packages/select/tests/upstream/Stale.test.ts';
	assert.throws(function buildInvalidInventory() {
		buildAdaptationInventory(pristineFixture(), adapted);
	}, /has no pristine identity/);
});

test('rejects an unexecuted adapted identity', function rejectsUnexecutedAdaptation() {
	const adapted = adaptedFixture();
	adapted.tests[0].status = 'skipped';
	assert.throws(function buildInvalidInventory() {
		buildAdaptationInventory(pristineFixture(), adapted);
	}, /Adapted case did not pass/);
});

test('records canonical skipped identities as not-applicable', function recordsSkippedIdentities() {
	const inventory = buildAdaptationInventory(pristineFixture(), adaptedFixture());
	assert.equal(inventory.upstreamCases, 258);
	assert.equal(inventory.adaptedCases, 255);
	assert.equal(inventory.notApplicableCases, 3);
	assert.equal(inventory.pendingCases, 0);
	const skipped = inventory.cases.filter(function notApplicable(entry) {
		return entry.disposition === 'not-applicable';
	});
	assert.equal(skipped.length, 3);
	for (const entry of skipped) {
		assert.equal(typeof entry.reason, 'string');
		assert.ok(entry.reason.length > 0);
	}
});
