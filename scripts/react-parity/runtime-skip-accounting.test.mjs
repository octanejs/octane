import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateRuntimeInventory, verifyLaneRunResult } from './harness-lib.mjs';

function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), 'parity-skip-accounting-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const lane = {
		id: 'full',
		project: 'fixture',
		execution: { kind: 'vitest-full', inventory: 'inventory.json' },
	};
	const inventory = {
		schemaVersion: 2,
		project: 'fixture',
		roots: ['tests'],
		files: ['tests/suite.test.ts'],
		tests: [{ id: 'pass', file: 'tests/suite.test.ts', fullName: 'passes' }],
		skippedTests: [
			{
				id: 'static',
				file: 'tests/suite.test.ts',
				fullName: 'static skip',
				mode: 'skip',
				rationale: 'Disabled by the pinned configuration.',
			},
			{
				id: 'dynamic',
				file: 'tests/suite.test.ts',
				fullName: 'runtime skip',
				mode: 'run',
				rationale: 'The pinned case explicitly skips in jsdom.',
			},
			{
				id: 'todo',
				file: 'tests/suite.test.ts',
				fullName: 'todo',
				mode: 'todo',
				rationale: 'An upstream todo registration.',
			},
		],
	};
	const assertions = [
		{ fullName: 'passes', status: 'passed' },
		{ fullName: 'static skip', status: 'skipped' },
		{ fullName: 'runtime skip', status: 'skipped' },
		{ fullName: 'todo', status: 'todo' },
	];
	return {
		inventory,
		assertions,
		validate() {
			validateRuntimeInventory(inventory, lane, ['tests']);
		},
		verify() {
			writeFileSync(join(root, 'inventory.json'), JSON.stringify(inventory));
			return verifyLaneRunResult(
				lane,
				JSON.stringify({
					testResults: [{ name: join(root, 'tests/suite.test.ts'), assertionResults: assertions }],
				}),
				root,
			);
		},
	};
}

test('accounts for every pass, collection skip, runtime skip and todo separately', (t) => {
	const f = fixture(t);
	f.validate();
	assert.equal(f.verify(), true);
});

for (const [label, mutate] of [
	[
		'a passing contract is skipped',
		(f) => {
			f.assertions[0].status = 'skipped';
		},
	],
	[
		'a declared skipped case disappears',
		(f) => {
			f.assertions.splice(1, 1);
		},
	],
	[
		'a runtime skip unexpectedly executes',
		(f) => {
			f.assertions[2].status = 'passed';
		},
	],
	[
		'a todo is silently treated as a skip',
		(f) => {
			f.assertions[3].status = 'skipped';
		},
	],
	[
		'an additional skipped case appears',
		(f) => {
			f.assertions.push({ fullName: 'extra', status: 'skipped' });
		},
	],
	[
		'a skipped case is reported twice',
		(f) => {
			f.assertions.push(f.assertions[1]);
		},
	],
])
	test(`rejects when ${label}`, (t) => {
		const f = fixture(t);
		mutate(f);
		assert.throws(() => f.verify(), /did not execute every inventoried test identity exactly once/);
	});

test('requires a rationale and valid collection mode for each disposition', (t) => {
	const f = fixture(t);
	f.inventory.skippedTests[0].rationale = '';
	assert.throws(() => f.validate(), /invalid skip dispositions/);
	f.inventory.skippedTests[0].rationale = 'Reviewed';
	f.inventory.skippedTests[0].mode = 'failed';
	assert.throws(() => f.validate(), /invalid skip dispositions/);
});

test('rejects duplicate registration ids across pass and skip inventories', (t) => {
	const f = fixture(t);
	f.inventory.skippedTests[0].id = 'pass';
	assert.throws(() => f.validate(), /duplicate test identities/);
});

test('legacy inventories still require every recorded test to pass', (t) => {
	const f = fixture(t);
	f.inventory.schemaVersion = 1;
	assert.throws(() => f.verify(), /did not execute every inventoried test identity exactly once/);
});
