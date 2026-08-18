import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyLaneCollectedTests } from './harness-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const manifest = JSON.parse(
	readFileSync(new URL('../../packages/dnd-kit/audit/react-parity.json', import.meta.url), 'utf8'),
);

function portablePaths(directory, pattern) {
	return readdirSync(resolve(root, directory), {
		recursive: true,
		withFileTypes: true,
	})
		.filter(function (entry) {
			return entry.isFile() && pattern.test(entry.name);
		})
		.map(function (entry) {
			return relative(root, resolve(entry.parentPath ?? entry.path, entry.name))
				.split(sep)
				.join('/');
		});
}

test('dnd-kit classifies every port-authored test exactly once', () => {
	const discovered = [
		...portablePaths('packages/dnd-kit/tests', /\.test\.(?:ts|tsx|tsrx)$/),
		...portablePaths('packages/dnd-kit/typetests', /\.test-d\.ts$/),
	].sort();
	const declared = JSON.parse(
		readFileSync(
			new URL('../../packages/dnd-kit/audit/test-classifications.json', import.meta.url),
			'utf8',
		),
	)
		.tests.map(function (entry) {
			return entry.path;
		})
		.sort();
	assert.deepEqual(discovered, declared);
});

test('dnd-kit differential lane rejects a renamed declared case', () => {
	const lane = manifest.lanes.find(function (entry) {
		return entry.id === 'dnd-kit-runtime-differential';
	});
	const collected = lane.files
		.filter(function (file) {
			return file.role === 'test';
		})
		.flatMap(function (file) {
			return file.cases.map(function (entry) {
				return {
					file: fileURLToPath(new URL(`../../${file.path}`, import.meta.url)),
					name: `${entry.fullName} renamed`,
				};
			});
		});
	assert.throws(function () {
		verifyLaneCollectedTests(lane, collected, root);
	}, /fullName must match exactly one collected Vitest test/);
});
