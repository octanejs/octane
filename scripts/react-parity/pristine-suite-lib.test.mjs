import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
	inventoryFromIdentities,
	loadPristineSuiteConfig,
	pristineIdentitiesFromReport,
} from './pristine-suite-lib.mjs';

function fixtureRoot(config) {
	const root = mkdtempSync(join(tmpdir(), 'pristine-suite-config-'));
	mkdirSync(join(root, 'packages/example/audit'), { recursive: true });
	writeFileSync(join(root, 'packages/example/audit/pristine-suite.json'), JSON.stringify(config));
	return root;
}

test('accepts a complete config and rejects missing or unsafe fields', () => {
	const valid = {
		schemaVersion: 1,
		project: 'example-pristine',
		vitestConfig: 'tests/upstream-vitest.config.ts',
		rootEnvVar: 'EXAMPLE_PRISTINE_ROOT',
		copy: ['src', 'tests'],
	};
	const root = fixtureRoot(valid);
	assert.equal(loadPristineSuiteConfig(root, 'packages/example').project, 'example-pristine');
	for (const broken of [
		{ ...valid, schemaVersion: 2 },
		{ ...valid, project: '' },
		{ ...valid, copy: [] },
		{ ...valid, copy: ['../escape'] },
		{ ...valid, overlay: '/absolute' },
		{ ...valid, inlineFiles: { '../package.json': '{}' } },
		{ ...valid, inlineFiles: { '/etc/passwd': 'x' } },
	]) {
		assert.throws(() => loadPristineSuiteConfig(fixtureRoot(broken), 'packages/example'));
	}
});

test('maps scratch-root report paths onto the portable upstream prefix', () => {
	const report = {
		testResults: [
			{
				name: '/repo/packages/example/.pristine-upstream-abc123/tests/index.test.tsx',
				assertionResults: [
					{ fullName: 'renders', status: 'passed' },
					{ fullName: 'skipped case', status: 'pending' },
				],
			},
		],
	};
	assert.deepEqual(
		pristineIdentitiesFromReport(report, { repoRoot: '/repo', packagePath: 'packages/example' }),
		[
			{
				file: 'packages/example/upstream/tests/index.test.tsx',
				fullName: 'renders',
				status: 'passed',
			},
		],
	);
});

test('inventory ids are deterministic and duplicate identities stay distinct', () => {
	const identities = [
		{ file: 'packages/example/upstream/tests/a.test.ts', fullName: 'same title', status: 'passed' },
		{ file: 'packages/example/upstream/tests/a.test.ts', fullName: 'same title', status: 'passed' },
		{
			file: 'packages/example/upstream/tests/a.test.ts',
			fullName: 'failed case',
			status: 'failed',
		},
	];
	const inventory = inventoryFromIdentities(identities, {
		project: 'example-pristine',
		roots: ['packages/example/upstream'],
	});
	assert.equal(inventory.tests.length, 2);
	assert.notEqual(inventory.tests[0].id, inventory.tests[1].id);
	assert.match(inventory.tests[1].id, /^runtime:[0-9a-f]{16}:2$/);
	const again = inventoryFromIdentities(identities, {
		project: 'example-pristine',
		roots: ['packages/example/upstream'],
	});
	assert.deepEqual(again, inventory);
});
