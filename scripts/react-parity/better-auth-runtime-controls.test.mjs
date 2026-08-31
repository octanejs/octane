import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyLaneCollectedTests } from './harness-lib.mjs';
import { verifyBetterAuthRuntimeInventory } from './better-auth-runtime-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const inventory = JSON.parse(
	readFileSync(new URL('../../packages/better-auth/audit/adapted-runtime.json', import.meta.url)),
);

test('Better Auth runtime inventory is non-empty and covers every differential test file', () => {
	assert.deepEqual(verifyBetterAuthRuntimeInventory(root), { files: 1, tests: 1 });
});

test('Better Auth runtime inventory rejects an omitted case', () => {
	assert.throws(
		() => verifyBetterAuthRuntimeInventory(root, { ...inventory, tests: [] }),
		/invalid or empty schema/,
	);
});

test('Better Auth runtime lane rejects a renamed collected identity', () => {
	const lane = {
		id: 'better-auth-runtime-differential',
		files: [
			{
				path: inventory.files[0],
				role: 'test',
				cases: [
					{
						id: 'differential:better-auth-client-surface',
						testName: 'matches session, plugin atom, and plugin action behavior',
						fullName: inventory.tests[0].fullName,
					},
				],
			},
		],
	};
	assert.throws(
		() =>
			verifyLaneCollectedTests(
				lane,
				[{ file: resolveFile(inventory.files[0]), name: `${inventory.tests[0].fullName} renamed` }],
				root,
			),
		/fullName must match exactly one collected Vitest test/,
	);
});

function resolveFile(relativePath) {
	return fileURLToPath(new URL(`../../${relativePath}`, import.meta.url));
}
