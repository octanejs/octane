import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyLaneCollectedTests } from './harness-lib.mjs';
import { verifyPortTestClassifications } from './binding-classifications-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const manifest = JSON.parse(
	readFileSync(
		new URL('../../packages/tanstack-router-ssr-query/audit/react-parity.json', import.meta.url),
		'utf8',
	),
);

test('tanstack-router-ssr-query classifies every port-authored test exactly once', () => {
	verifyPortTestClassifications(root, 'tanstack-router-ssr-query');
});

test('tanstack-router-ssr-query differential lane rejects a renamed declared case', () => {
	const lane = manifest.lanes.find(
		(entry) => entry.id === 'tanstack-router-ssr-query-differential',
	);
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
