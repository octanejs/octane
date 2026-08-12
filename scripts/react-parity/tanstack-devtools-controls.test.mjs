import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyLaneCollectedTests } from './harness-lib.mjs';
import { verifyTanstackDevtoolsTestClassifications } from './tanstack-devtools-classifications-lib.mjs';
import { verifyTypeInventories } from './tanstack-devtools-types-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const manifest = JSON.parse(
	readFileSync(
		new URL('../../packages/tanstack-devtools/audit/react-parity.json', import.meta.url),
		'utf8',
	),
);

test('tanstack-devtools classifies every port-authored test exactly once', () => {
	assert.deepEqual(verifyTanstackDevtoolsTestClassifications(root), { tests: 10 });
});

test('tanstack-devtools differential lane rejects a renamed declared case', () => {
	const lane = manifest.lanes.find((entry) => entry.id === 'tanstack-devtools-differential');
	const collected = lane.files
		.filter((file) => file.role === 'test')
		.flatMap((file) =>
			file.cases.map((entry) => ({
				file: fileURLToPath(new URL(`../../${file.path}`, import.meta.url)),
				name: `${entry.fullName} renamed`,
			})),
		);
	assert.throws(
		() => verifyLaneCollectedTests(lane, collected, root),
		/fullName must match exactly one collected Vitest test/,
	);
});

test('tanstack-devtools records present upstream types with source-compile lanes', () => {
	assert.equal(manifest.upstreamSuites.types, 'present');
	assert.equal(manifest.provenance.verification, 'verified');
	assert.deepEqual(manifest.adaptedRoots.tests.roots, [
		'packages/tanstack-devtools/tests/differential',
		'packages/tanstack-devtools/tests/parity',
	]);
	assert.equal(
		manifest.lanes.some((entry) => entry.id === 'tanstack-devtools-divergence-contracts'),
		false,
	);
	for (const id of ['tanstack-devtools-pristine-types', 'tanstack-devtools-adapted-types']) {
		const lane = manifest.lanes.find((entry) => entry.id === id);
		assert.equal(lane?.oracle, 'required');
		assert.equal(lane?.evidenceOrigin, 'upstream-suite');
		assert.equal(lane?.execution?.kind, 'typescript');
	}
	assert.equal(
		manifest.lanes.find((entry) => entry.id === 'tanstack-devtools-pristine-types').execution
			.compiler,
		'tsc',
	);
	assert.equal(
		manifest.lanes.find((entry) => entry.id === 'tanstack-devtools-adapted-types').execution
			.compiler,
		'tsrx-tsc',
	);
	const inventories = verifyTypeInventories(root);
	assert.equal(inventories.pairs, 2);
	assert.ok(inventories.exports > 0);
	assert.ok(inventories.probePairs >= 1);
	assert.ok(inventories.assertions > 0);
});

test('tanstack-devtools cites ordinary conformance cases for non-type divergences', () => {
	const byId = Object.fromEntries(manifest.divergences.map((entry) => [entry.id, entry]));
	assert.deepEqual(byId['core-version'].caseIds, ['conformance:tanstack-devtools-core-version']);
	assert.deepEqual(byId['extra-core-reexports'].caseIds, [
		'conformance:tanstack-devtools-extra-core-reexports',
	]);
	assert.deepEqual(byId['octane-type-names'].caseIds, [
		'conformance:tanstack-devtools-octane-type-names',
	]);
});
