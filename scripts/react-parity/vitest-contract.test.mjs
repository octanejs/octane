import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	discoverProjectFiles,
	projectSelects,
	validateVitestContracts,
} from './vitest-contract.mjs';

function targetedLane(id, project, file, fullName = `${id} passes`) {
	return {
		id,
		oracle: 'required',
		project,
		files: [{ path: file, role: 'test', cases: [{ fullName }] }],
	};
}

async function fixture(t) {
	const root = await mkdtemp(path.join(tmpdir(), 'react-parity-vitest-contract-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const files = [
		'packages/full/parity.test.ts',
		'packages/mixed/parity.test.ts',
		'packages/mixed/ordinary.test.ts',
		'packages/suite/one.test.ts',
		'packages/wrapper/wrapper.test.ts',
	];
	for (const file of files) {
		await mkdir(path.dirname(path.join(root, file)), { recursive: true });
		await writeFile(path.join(root, file), '');
	}
	await writeFile(
		path.join(root, 'inventory.json'),
		JSON.stringify({
			files: ['packages/suite/one.test.ts'],
			tests: [
				{ file: 'packages/suite/one.test.ts', fullName: 'suite one' },
				{ file: 'packages/suite/one.test.ts', fullName: 'suite one' },
			],
		}),
	);

	const baseProjects = [
		{
			testExecution: { group: 'react-parity' },
			test: {
				name: 'full',
				include: ['packages/full/**/*.test.ts'],
				testTimeout: 12_345,
			},
		},
		{
			testExecution: {
				group: 'react-parity',
				include: ['packages/mixed/parity.test.ts'],
			},
			test: { name: 'mixed', include: ['packages/mixed/**/*.test.ts'] },
		},
		{
			testExecution: { group: 'react-parity' },
			test: { name: 'suite', include: ['packages/suite/**/*.test.ts'] },
		},
		{
			testExecution: { group: 'react-parity' },
			test: { name: 'wrapper', include: ['packages/wrapper/**/*.test.ts'] },
		},
	];
	const shardedProjects = [
		{
			test: {
				name: 'mixed',
				include: ['packages/mixed/**/*.test.ts'],
				exclude: ['packages/mixed/parity.test.ts'],
			},
		},
	];
	const manifestEntries = [
		{
			path: 'packages/example/audit/react-parity.json',
			manifest: {
				lanes: [
					targetedLane('full-lane', 'full', 'packages/full/parity.test.ts'),
					targetedLane('mixed-lane', 'mixed', 'packages/mixed/parity.test.ts'),
					{
						...targetedLane('suite-lane', 'suite', 'packages/suite/one.test.ts'),
						execution: { kind: 'vitest-full', inventory: 'inventory.json' },
					},
					{
						id: 'direct-lane',
						oracle: 'required',
						project: 'wrapper',
						execution: { kind: 'jest-full' },
						files: [{ path: 'packages/wrapper/wrapper.test.ts', role: 'support' }],
					},
				],
			},
		},
	];
	return { root, baseProjects, shardedProjects, manifestEntries };
}

test('matches live project include and exclude semantics while discovering only selected files', async (t) => {
	const model = await fixture(t);
	const project = {
		test: {
			include: ['packages/mixed/**/*.test.ts', '!packages/mixed/ignored.test.ts'],
			exclude: ['packages/mixed/ordinary.test.ts'],
		},
	};
	assert.equal(projectSelects(project, 'packages/mixed/parity.test.ts'), true);
	assert.equal(projectSelects(project, 'packages/mixed/ordinary.test.ts'), false);
	assert.equal(projectSelects(project, 'packages/mixed/ignored.test.ts'), false);
	assert.deepEqual(
		[...(await discoverProjectFiles(project, model.root))],
		['packages/mixed/parity.test.ts'],
	);
});

test('accepts full, scoped, full-suite, and direct-wrapper ownership despite harmless config changes', async (t) => {
	const model = await fixture(t);
	assert.deepEqual(await validateVitestContracts(model), {
		requiredVitestLanes: 3,
		ownedProjects: 4,
		claimedFiles: 4,
		expectedIdentities: 3,
	});
});

test('rejects missing projects and evidence excluded by the live project', async (t) => {
	const missing = await fixture(t);
	missing.manifestEntries[0].manifest.lanes[0].project = 'missing';
	await assert.rejects(
		() => validateVitestContracts(missing),
		/references missing project missing/,
	);

	const excluded = await fixture(t);
	excluded.baseProjects[0].test.exclude = ['packages/full/parity.test.ts'];
	await assert.rejects(
		() => validateVitestContracts(excluded),
		/project full does not select packages\/full\/parity\.test\.ts: test\.exclude pattern/,
	);
});

test('rejects claimed files outside ownership and ownership broader than the claims', async (t) => {
	const missingOwnership = await fixture(t);
	missingOwnership.baseProjects[1].testExecution.include = ['packages/mixed/other.test.ts'];
	missingOwnership.shardedProjects[0].test.exclude = ['packages/mixed/other.test.ts'];
	await assert.rejects(
		() => validateVitestContracts(missingOwnership),
		/claims packages\/mixed\/parity\.test\.ts.*testExecution does not own it/,
	);

	const broadOwnership = await fixture(t);
	broadOwnership.baseProjects[1].testExecution.include = ['packages/mixed/**/*.test.ts'];
	broadOwnership.shardedProjects[0].test.exclude = ['packages/mixed/**/*.test.ts'];
	await assert.rejects(
		() => validateVitestContracts(broadOwnership),
		/owns packages\/mixed\/ordinary\.test\.ts, but no required available lane claims it/,
	);
});

test('rejects orphan ownership without a required available lane', async (t) => {
	const model = await fixture(t);
	model.manifestEntries[0].manifest.lanes = model.manifestEntries[0].manifest.lanes.filter(
		(lane) => lane.project !== 'full',
	);
	await assert.rejects(
		() => validateVitestContracts(model),
		/project full testExecution owns packages\/full\/parity\.test\.ts, but no required available lane claims it/,
	);
});

test('rejects cross-lane duplicate identities but preserves a full-suite multiset', async (t) => {
	const model = await fixture(t);
	model.manifestEntries[0].manifest.lanes.push(
		targetedLane('duplicate-lane', 'full', 'packages/full/parity.test.ts', 'full-lane passes'),
	);
	await assert.rejects(
		() => validateVitestContracts(model),
		/duplicate-lane duplicates Vitest identity already claimed by .*full-lane/,
	);
});

test('rejects stale sharded output and leaked repository-only metadata', async (t) => {
	const stale = await fixture(t);
	stale.shardedProjects[0].test.exclude = [];
	await assert.rejects(
		() => validateVitestContracts(stale),
		/does not exclude ownership pattern "packages\/mixed\/parity\.test\.ts"/,
	);

	const leaked = await fixture(t);
	leaked.shardedProjects[0].testExecution = undefined;
	await assert.rejects(() => validateVitestContracts(leaked), /retains testExecution metadata/);
});

test('rejects an owned file selected by a different ordinary sharded project', async (t) => {
	const model = await fixture(t);
	model.baseProjects.push({
		test: { name: 'overlap', include: ['packages/full/**/*.test.ts'] },
	});
	model.shardedProjects.push({
		test: { name: 'overlap', include: ['packages/full/**/*.test.ts'] },
	});
	await assert.rejects(
		() => validateVitestContracts(model),
		/project full testExecution owns packages\/full\/parity\.test\.ts, but sharded project overlap still selects it/,
	);
});

test('rejects duplicate project names before building ownership', async (t) => {
	const model = await fixture(t);
	model.baseProjects.push(structuredClone(model.baseProjects[0]));
	await assert.rejects(
		() => validateVitestContracts(model),
		/base Vitest config contains duplicate project name full/,
	);
});
