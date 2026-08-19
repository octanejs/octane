import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyLaneCollectedTests } from './harness-lib.mjs';
import { verifyTanstackPacerTypes } from './tanstack-pacer-types-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const manifest = JSON.parse(
	readFileSync(
		new URL('../../packages/tanstack-pacer/audit/react-parity.json', import.meta.url),
		'utf8',
	),
);

function discoverAuthoredTests() {
	const roots = [
		resolve(root, 'packages/tanstack-pacer/tests'),
		resolve(root, 'packages/tanstack-pacer/typetests'),
	];
	const discovered = [];
	for (const suiteRoot of roots) {
		for (const entry of readdirSync(suiteRoot, { recursive: true, withFileTypes: true })) {
			if (!entry.isFile()) continue;
			if (!/\.(?:test|test-d)\.(?:ts|tsx|tsrx)$/.test(entry.name)) continue;
			discovered.push(
				relative(root, resolve(entry.parentPath ?? entry.path, entry.name))
					.split(sep)
					.join('/'),
			);
		}
	}
	return discovered.sort();
}

test('tanstack-pacer classifies every port-authored test exactly once', () => {
	const discovered = discoverAuthoredTests();
	const declared = JSON.parse(
		readFileSync(
			new URL('../../packages/tanstack-pacer/audit/test-classifications.json', import.meta.url),
			'utf8',
		),
	)
		.tests.map(function path(entry) {
			return entry.path;
		})
		.sort();
	assert.deepEqual(discovered, declared);
});

test('tanstack-pacer type inventories cover the complete adapted source suite', () => {
	const result = verifyTanstackPacerTypes(root);
	assert.equal(result.files, 43);
	assert.equal(result.adaptedFiles, 45);
});

test('tanstack-pacer differential lane rejects a renamed declared case', () => {
	const lane = manifest.lanes.find(function find(entry) {
		return entry.id === 'tanstack-pacer-differential';
	});
	const collected = lane.files
		.filter(function keepTest(file) {
			return file.role === 'test';
		})
		.flatMap(function cases(file) {
			return file.cases.map(function renamed(entry) {
				return {
					file: fileURLToPath(new URL(`../../${file.path}`, import.meta.url)),
					name: `${entry.fullName} renamed`,
				};
			});
		});
	assert.throws(function renamedCase() {
		verifyLaneCollectedTests(lane, collected, root);
	}, /fullName must match exactly one collected Vitest test/);
});
