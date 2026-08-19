import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { verifyLaneCollectedTests } from './harness-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const manifest = JSON.parse(
	readFileSync(new URL('../../packages/cmdk/audit/react-parity.json', import.meta.url), 'utf8'),
);

test('cmdk classifies every port-authored test exactly once', () => {
	const discovered = readdirSync(resolve(root, 'packages/cmdk/tests'), {
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
	const classifications = JSON.parse(
		readFileSync(
			new URL('../../packages/cmdk/audit/test-classifications.json', import.meta.url),
			'utf8',
		),
	)
		.tests.map((entry) => entry.path)
		.sort();
	assert.deepEqual(discovered, classifications);
});

test('cmdk differential lane rejects a renamed declared case', () => {
	const lane = manifest.lanes.find((entry) => entry.id === 'cmdk-runtime-differential');
	const collected = lane.files
		.filter((file) => file.role === 'test')
		.flatMap((file) =>
			file.cases.map((entry) => ({
				file: fileURLToPath(new URL(`../../${file.path}`, import.meta.url)),
				name: entry.fullName,
			})),
		);
	collected[0] = { ...collected[0], name: `${collected[0].name} renamed` };
	assert.throws(
		() => verifyLaneCollectedTests(lane, collected, root),
		/fullName must match exactly one collected Vitest test/,
	);
});
