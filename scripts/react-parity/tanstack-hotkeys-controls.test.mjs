import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyLaneCollectedTests } from './harness-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const manifest = JSON.parse(
	readFileSync(
		new URL('../../packages/tanstack-hotkeys/audit/react-parity.json', import.meta.url),
		'utf8',
	),
);

test('tanstack-hotkeys classifies every port-authored test exactly once', () => {
	const discovered = readdirSync(resolve(root, 'packages/tanstack-hotkeys/tests'), {
		recursive: true,
		withFileTypes: true,
	})
		.filter((entry) => entry.isFile() && /\.test\.(?:ts|tsx|tsrx)$/.test(entry.name))
		.map((entry) =>
			relative(root, resolve(entry.parentPath ?? entry.path, entry.name))
				.split(sep)
				.join('/'),
		)
		.sort();
	const declared = JSON.parse(
		readFileSync(
			new URL('../../packages/tanstack-hotkeys/audit/test-classifications.json', import.meta.url),
			'utf8',
		),
	)
		.tests.map((entry) => entry.path)
		.sort();
	assert.deepEqual(discovered, declared);
});

test('tanstack-hotkeys differential lane rejects a renamed declared case', () => {
	const lane = manifest.lanes.find((entry) => entry.id === 'tanstack-hotkeys-differential');
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
