import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyLaneCollectedTests } from './harness-lib.mjs';
import { verifyTypeInventories } from './tanstack-devtools-types-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const manifest = JSON.parse(
	readFileSync(
		new URL('../../packages/tanstack-devtools/audit/react-parity.json', import.meta.url),
		'utf8',
	),
);

const DISPOSITIONS = new Set([
	'react-octane-differential',
	'octane-only-divergence',
	'octane-only-framework-contract',
	'octane-only-audit-contract',
]);

function discoverAuthoredTests() {
	const roots = [
		resolve(root, 'packages/tanstack-devtools/tests'),
		resolve(root, 'packages/tanstack-devtools/audit/type-probes'),
		resolve(root, 'packages/tanstack-devtools/typetests'),
		resolve(root, 'scripts/react-parity'),
	];
	const found = [];
	for (const dir of roots) {
		for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
			if (!entry.isFile()) continue;
			const absolute = resolve(entry.parentPath ?? entry.path, entry.name);
			const portable = relative(root, absolute).split(sep).join('/');
			if (dir.endsWith(`${sep}react-parity`) || portable.includes('/scripts/react-parity/')) {
				if (!/^tanstack-devtools.*\.test\.mjs$/.test(entry.name)) continue;
			} else if (!/\.(?:test|test-d)\.(?:ts|tsx|tsrx|mjs)$/.test(entry.name)) {
				continue;
			}
			if (portable.includes('/typetests/pristine/') || portable.includes('/typetests/adapted/'))
				continue;
			found.push(portable);
		}
	}
	return found.sort();
}

test('tanstack-devtools classifies every port-authored test exactly once', () => {
	const discovered = discoverAuthoredTests();
	const config = JSON.parse(
		readFileSync(
			new URL('../../packages/tanstack-devtools/audit/test-classifications.json', import.meta.url),
			'utf8',
		),
	);
	const declared = config.tests.map((entry) => entry.path).sort();
	assert.deepEqual(discovered, declared);
	const divergenceIds = new Set(manifest.divergences.map((entry) => entry.id));
	for (const entry of config.tests) {
		assert.ok(DISPOSITIONS.has(entry.disposition), `${entry.path}: unknown disposition`);
		if (entry.disposition.startsWith('octane-only-')) {
			assert.ok(entry.reason, `${entry.path}: Octane-only tests require a reason`);
			assert.equal(entry.oracle, undefined, `${entry.path}: must not claim React parity`);
		} else {
			assert.ok(entry.oracle, `${entry.path}: React-parity evidence requires an oracle`);
		}
		if (entry.disposition === 'octane-only-divergence') {
			const ids = entry.divergenceIds ?? [entry.divergenceId].filter(Boolean);
			assert.ok(ids.length, `${entry.path}: divergence tests require a manifest divergence id`);
			for (const id of ids) assert.ok(divergenceIds.has(id), `${entry.path}: unknown ${id}`);
		}
	}
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
