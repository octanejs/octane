import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
	buildLaneArgv,
	buildTypeScriptCompilerArgv,
	buildTypeScriptCompilerRuns,
	compareTestIdentities,
	describeTestIdentityMismatch,
	loadManifest,
	nodeMajorSatisfies,
	requiredExecutableLanes,
	selectHarnessAction,
	summarizeRuntimeInventories,
	toPortablePath,
	validateManifest,
	verifyLaneCollectedTests,
	verifyLaneEnvironment,
	verifyLaneRunResult,
	verifyManifestFiles,
	verifyManifestTestSelections,
} from './harness-lib.mjs';

test('describeTestIdentityMismatch reports missing, unexpected, and duplicate identities', () => {
	const passed = { file: 'test.ts', fullName: 'works', status: 'passed' };
	const skipped = { ...passed, status: 'skipped' };
	const message = describeTestIdentityMismatch([passed, passed], [passed, skipped]);
	assert.match(message, /missing \(1\):/);
	assert.match(message, /test\.ts :: works \[passed\]/);
	assert.match(message, /unexpected \(1\):/);
	assert.match(message, /test\.ts :: works \[skipped\]/);
});

test('summarizes inventory entries, within-lane duplicates, and cross-lane overlap separately', () => {
	const works = { file: 'example.test.ts', fullName: 'suite works' };
	assert.deepEqual(
		summarizeRuntimeInventories([
			{ tests: [works, works, { file: 'example.test.ts', fullName: 'suite other' }] },
			{ tests: [works, { file: 'server.test.ts', fullName: 'server works' }] },
		]),
		{
			inventoryEntries: 5,
			uniqueIdentities: 3,
			duplicateEntriesWithinLanes: 1,
			identitiesSharedAcrossLanes: 1,
		},
	);
});

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function manifest(overrides = {}) {
	return {
		schemaVersion: 1,
		provenance: {
			repo: 'https://github.com/react-hook-form/react-hook-form.git',
			version: '7.81.0',
			commit: '46b217e034dd92f7aa3cb3a478815556b416b299',
			sourceRoot: 'src',
			testRoot: 'src/__tests__',
			license: 'MIT',
			integrity: `sha256:${'0'.repeat(64)}`,
			verification: 'recorded-unverified',
		},
		upstreamSuites: { runtime: 'present', types: 'present' },
		adaptedRoots: {
			source: {
				roots: ['packages/hook-form/tests/upstream'],
				include: ['\\.(?:[cm]?[jt]s|[jt]sx|tsrx)$'],
				exclude: [],
			},
			tests: {
				roots: ['packages/hook-form/tests/upstream'],
				include: ['\\.test\\.(?:ts|tsx)$'],
				exclude: [],
			},
		},
		adaptedRuntimeSummary: {
			inventoryEntries: 0,
			uniqueIdentities: 0,
			duplicateEntriesWithinLanes: 0,
			identitiesSharedAcrossLanes: 0,
		},
		environments: {
			local: {
				node: '>=22',
				platform: 'any',
				arch: 'any',
				packageManager: 'pnpm@11.15.1',
				lockfile: 'pnpm-lock.yaml',
				lockfileSha256: sha256('lockfile'),
			},
		},
		lanes: [
			{
				id: 'adapted',
				type: 'adapted-octane',
				oracle: 'required',
				environment: 'local',
				project: 'hook-form',
				files: [
					{
						path: 'packages/hook-form/tests/upstream/example.test.ts',
						role: 'test',
						sha256: sha256('example'),
						cases: [
							{
								id: 'adapted:example',
								testName: 'does the thing',
								fullName: 'example suite does the thing',
							},
						],
					},
				],
			},
		],
		divergences: [],
		...overrides,
	};
}

function divergence(overrides = {}) {
	return {
		id: 'native-input',
		caseIds: ['adapted:example'],
		upstreamResult: 'Controller exposes field.onChange.',
		octaneResult: 'Controller exposes field.onInput.',
		rationale: 'Octane uses native input events.',
		classification: 'event-model',
		consumerImpact: 'Consumers bind a different native handler.',
		migrationGuidance: 'Use onInput in Octane templates.',
		owner: '@octanejs/hook-form',
		reviewCondition: 'Review if Octane adds React-compatible synthetic events.',
		...overrides,
	};
}

function fullRuntimeLane(type, evidenceOrigin = 'upstream-suite') {
	const inventory = `audit/${type}.json`;
	return {
		...manifest().lanes[0],
		id: `full-${type}`,
		type,
		evidenceOrigin,
		files: [{ path: inventory, role: 'support', sha256: '0'.repeat(64) }],
		execution:
			type === 'pristine-upstream'
				? {
						kind: 'jest-full',
						config: 'packages/example/jest.config.cjs',
						root: 'packages/example/upstream',
						inventory,
					}
				: { kind: 'vitest-full', inventory },
	};
}

function typeLane(type, evidenceOrigin = 'upstream-suite') {
	return {
		...manifest().lanes[0],
		id: type,
		type,
		evidenceOrigin,
		files: [
			{
				...manifest().lanes[0].files[0],
				cases: [{ id: `types:${type}`, testName: type, fullName: type }],
			},
		],
		execution: {
			kind: 'typescript',
			compiler: type === 'adapted-types' ? 'tsrx-tsc' : 'tsc',
			project: 'packages/example/tsconfig.json',
		},
	};
}

function differentialLane() {
	return {
		...manifest().lanes[0],
		id: 'repo-authored-differential',
		type: 'differential',
		evidenceOrigin: 'repo-authored',
	};
}

function verifiedManifest() {
	const value = manifest();
	value.provenance.verification = 'verified';
	value.lanes = [
		fullRuntimeLane('pristine-upstream'),
		fullRuntimeLane('adapted-octane'),
		typeLane('pristine-types'),
		typeLane('adapted-types'),
	];
	return value;
}

test('accepts distinct lane types and builds deterministic argv without a shell', () => {
	const value = manifest();
	assert.deepEqual(validateManifest(value), value);
	assert.deepEqual(buildLaneArgv(value.lanes[0]), [
		process.execPath,
		'node_modules/vitest/vitest.mjs',
		'run',
		'--project',
		'hook-form',
		'-t',
		'^(?:example suite does the thing)$',
		'packages/hook-form/tests/upstream/example.test.ts',
		'--reporter=./scripts/react-parity/vitest-json-reporter.mjs',
	]);
});

test('validates exact focused Vitest identities from the execution report', () => {
	const lane = manifest().lanes[0];
	const result = (
		assertionResults,
		file = '/repo/packages/hook-form/tests/upstream/example.test.ts',
	) => JSON.stringify({ testResults: [{ name: file, assertionResults }] });
	const declared = {
		fullName: 'example suite does the thing',
		status: 'passed',
	};
	assert.equal(
		verifyLaneRunResult(
			lane,
			result([declared, { fullName: 'example suite unrelated', status: 'pending' }]),
			'/repo',
		),
		true,
	);
	assert.throws(
		() => verifyLaneRunResult(lane, result([{ ...declared, status: 'pending' }]), '/repo'),
		/did not execute every declared test identity exactly once/,
	);
	assert.throws(
		() =>
			verifyLaneRunResult(
				lane,
				result([declared], '/repo/packages/hook-form/tests/upstream/wrong.test.ts'),
				'/repo',
			),
		/did not execute every declared test identity exactly once/,
	);
	assert.throws(
		() => verifyLaneRunResult(lane, result([declared, declared]), '/repo'),
		/did not execute every declared test identity exactly once/,
	);
});

test('selects every available required lane for recorded-unverified aggregate execution', () => {
	const value = manifest();
	value.lanes.push(
		{ ...value.lanes[0], id: 'differential', type: 'differential' },
		{ ...value.lanes[0], id: 'optional', oracle: 'optional' },
		{ ...value.lanes[0], id: 'unavailable', available: false },
	);
	assert.deepEqual(
		requiredExecutableLanes(value).map((lane) => lane.id),
		['adapted', 'differential'],
	);
	value.provenance.verification = 'verified';
	assert.deepEqual(
		requiredExecutableLanes(value).map((lane) => lane.id),
		['adapted', 'differential'],
	);
});

test('lexical exact selection fails closed when a declared case is renamed', async () => {
	const value = await loadManifest('packages/lexical/audit/react-parity.json');
	const renamed = structuredClone(value);
	renamed.lanes[0].files[0].cases[0].fullName += ' renamed';
	await assert.rejects(
		() => verifyManifestTestSelections(renamed, process.cwd()),
		/must match exactly one collected Vitest test/,
	);
});

test('lucide exact selection fails closed when a declared case is renamed', async () => {
	const value = await loadManifest('packages/lucide/audit/react-parity.json');
	await assert.doesNotReject(() => verifyManifestTestSelections(value, process.cwd()));
	const renamed = structuredClone(value);
	renamed.lanes[0].files[0].cases[0].fullName += ' renamed';
	await assert.rejects(
		() => verifyManifestTestSelections(renamed, process.cwd()),
		/must match exactly one collected Vitest test/,
	);
});

test('redux exact selection fails closed when a declared case is renamed', async () => {
	const value = await loadManifest('packages/redux/audit/react-parity.json');
	await assert.doesNotReject(() => verifyManifestTestSelections(value, process.cwd()));
	const renamed = structuredClone(value);
	renamed.lanes[0].files[0].cases[0].fullName += ' renamed';
	await assert.rejects(
		() => verifyManifestTestSelections(renamed, process.cwd()),
		/must match exactly one collected Vitest test/,
	);
});

test('redux-toolkit exact selection fails closed when a declared case is renamed', async () => {
	const value = await loadManifest('packages/redux-toolkit/audit/react-parity.json');
	await assert.doesNotReject(() => verifyManifestTestSelections(value, process.cwd()));
	const renamed = structuredClone(value);
	renamed.lanes[0].files[0].cases[0].fullName += ' renamed';
	await assert.rejects(
		() => verifyManifestTestSelections(renamed, process.cwd()),
		/must match exactly one collected Vitest test/,
	);
});

test('shadcn exact selection fails closed when a declared case is renamed', async () => {
	const value = await loadManifest('packages/shadcn/audit/react-parity.json');
	await assert.doesNotReject(() => verifyManifestTestSelections(value, process.cwd()));
	const renamed = structuredClone(value);
	renamed.lanes[0].files[0].cases[0].fullName += ' renamed';
	await assert.rejects(
		() => verifyManifestTestSelections(renamed, process.cwd()),
		/must match exactly one collected Vitest test/,
	);
});

test('sonner exact selection fails closed when a declared case is renamed', async () => {
	const value = await loadManifest('packages/sonner/audit/react-parity.json');
	await assert.doesNotReject(() => verifyManifestTestSelections(value, process.cwd()));
	const differential = value.lanes.find((lane) => lane.id === 'sonner-runtime-differential');
	assert.ok(differential);
	const renamed = structuredClone(value);
	const lane = renamed.lanes.find((entry) => entry.id === 'sonner-runtime-differential');
	lane.files[0].cases[0].fullName += ' renamed';
	await assert.rejects(
		() => verifyManifestTestSelections(renamed, process.cwd()),
		/must match exactly one collected Vitest test/,
	);
});

test('routes harness execution from required lanes, not provenance verification', () => {
	const unverified = manifest();
	unverified.provenance.verification = 'recorded-unverified';
	assert.equal(selectHarnessAction(unverified), 'run-required');

	const empty = manifest({ lanes: [] });
	assert.equal(selectHarnessAction(empty), 'validate');

	const unavailableOnly = manifest({
		lanes: [{ ...manifest().lanes[0], available: false }],
	});
	assert.equal(selectHarnessAction(unavailableOnly), 'validate');
});

test('remix-router exact selection fails closed when a declared case is renamed', async () => {
	const value = await loadManifest('packages/remix-router/audit/react-parity.json');
	await assert.doesNotReject(() => verifyManifestTestSelections(value, process.cwd()));
	const renamed = structuredClone(value);
	renamed.lanes[0].files[0].cases[0].fullName += ' renamed';
	await assert.rejects(
		() => verifyManifestTestSelections(renamed, process.cwd()),
		/must match exactly one collected Vitest test/,
	);
});

test('routes harness execution from required lanes, not provenance verification', () => {
	const unverified = manifest();
	unverified.provenance.verification = 'recorded-unverified';
	assert.equal(selectHarnessAction(unverified), 'run-required');

	const empty = manifest({ lanes: [] });
	assert.equal(selectHarnessAction(empty), 'validate');

	const unavailableOnly = manifest({
		lanes: [{ ...manifest().lanes[0], available: false }],
	});
	assert.equal(selectHarnessAction(unavailableOnly), 'validate');
});

test('streamdown exact selection fails closed when a declared case is renamed', async () => {
	const value = await loadManifest('packages/streamdown/audit/react-parity.json');
	await assert.doesNotReject(() => verifyManifestTestSelections(value, process.cwd()));
	const renamed = structuredClone(value);
	renamed.lanes[0].files[0].cases[0].fullName += ' renamed';
	await assert.rejects(
		() => verifyManifestTestSelections(renamed, process.cwd()),
		/must match exactly one collected Vitest test/,
	);
});

test('routes harness execution from required lanes, not provenance verification', () => {
	const unverified = manifest();
	unverified.provenance.verification = 'recorded-unverified';
	assert.equal(selectHarnessAction(unverified), 'run-required');

	const empty = manifest({ lanes: [] });
	assert.equal(selectHarnessAction(empty), 'validate');

	const unavailableOnly = manifest({
		lanes: [{ ...manifest().lanes[0], available: false }],
	});
	assert.equal(selectHarnessAction(unavailableOnly), 'validate');
});

test('styled-components exact selection fails closed when a declared case is renamed', async () => {
	const value = await loadManifest('packages/styled-components/audit/react-parity.json');
	await assert.doesNotReject(() => verifyManifestTestSelections(value, process.cwd()));
	const renamed = structuredClone(value);
	renamed.lanes[0].files[0].cases[0].fullName += ' renamed';
	await assert.rejects(
		() => verifyManifestTestSelections(renamed, process.cwd()),
		/must match exactly one collected Vitest test/,
	);
});

test('routes harness execution from required lanes, not provenance verification', () => {
	const unverified = manifest();
	unverified.provenance.verification = 'recorded-unverified';
	assert.equal(selectHarnessAction(unverified), 'run-required');

	const empty = manifest({ lanes: [] });
	assert.equal(selectHarnessAction(empty), 'validate');

	const unavailableOnly = manifest({
		lanes: [{ ...manifest().lanes[0], available: false }],
	});
	assert.equal(selectHarnessAction(unavailableOnly), 'validate');
});

test('routes harness execution from required lanes, not provenance verification', () => {
	const unverified = manifest();
	unverified.provenance.verification = 'recorded-unverified';
	assert.equal(selectHarnessAction(unverified), 'run-required');

	const empty = manifest({ lanes: [] });
	assert.equal(selectHarnessAction(empty), 'validate');

	const unavailableOnly = manifest({
		lanes: [{ ...manifest().lanes[0], available: false }],
	});
	assert.equal(selectHarnessAction(unavailableOnly), 'validate');
});

test('accepts explicit TypeScript lanes and builds portable compiler argv without a shell', () => {
	const lane = {
		...manifest().lanes[0],
		id: 'pristine-types',
		type: 'pristine-types',
		evidenceOrigin: 'upstream-suite',
		project: 'hook-form-pristine-types',
		execution: {
			kind: 'typescript',
			compiler: 'tsc',
			project: 'packages/hook-form/upstream/src/__typetest__/tsconfig.json',
		},
	};
	const value = manifest({ lanes: [lane] });
	assert.deepEqual(validateManifest(value), value);
	assert.deepEqual(buildLaneArgv(lane), [
		process.execPath,
		'node_modules/typescript/bin/tsc',
		'--noEmit',
		'-p',
		'packages/hook-form/upstream/src/__typetest__/tsconfig.json',
	]);
});

test('uses Node package entrypoints for every TypeScript compiler', () => {
	const lane = {
		...manifest().lanes[0],
		execution: {
			kind: 'typescript',
			compiler: 'tsc',
			project: 'tsconfig.json',
		},
	};
	const entrypoints = {
		tsc: 'node_modules/typescript/bin/tsc',
		tsgo: 'node_modules/@typescript/native-preview/bin/tsgo',
		'tsrx-tsc': 'node_modules/@tsrx/typescript-plugin/dist/tsc.js',
	};

	for (const [compiler, entrypoint] of Object.entries(entrypoints)) {
		const expected = [process.execPath, entrypoint, '--noEmit', '-p', 'tsconfig.json'];
		assert.deepEqual(buildTypeScriptCompilerArgv(compiler, 'tsconfig.json'), expected);
		assert.deepEqual(
			buildLaneArgv({ ...lane, execution: { ...lane.execution, compiler } }),
			expected,
		);
	}
});

test('expands optional compilerBins into one TypeScript run per binary', () => {
	const lane = {
		id: 'matrix-types',
		type: 'pristine-types',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'matrix-types',
		evidenceOrigin: 'upstream-suite',
		execution: {
			kind: 'typescript',
			compiler: 'tsc',
			compilerBins: [
				'node_modules/typescript55/lib/tsc.js',
				'node_modules/typescript60/lib/tsc.js',
			],
			project: 'packages/example/tsconfig.json',
		},
		files: [
			{
				path: 'packages/example/src/index.ts',
				role: 'test',
				sha256: '0'.repeat(64),
				cases: [
					{
						id: 'types:example',
						testName: 'example',
						fullName: 'example',
					},
				],
			},
		],
	};
	assert.deepEqual(buildTypeScriptCompilerRuns(lane), [
		[
			process.execPath,
			'node_modules/typescript55/lib/tsc.js',
			'--noEmit',
			'-p',
			'packages/example/tsconfig.json',
		],
		[
			process.execPath,
			'node_modules/typescript60/lib/tsc.js',
			'--noEmit',
			'-p',
			'packages/example/tsconfig.json',
		],
	]);
	assert.throws(function rejectsMultiRunLaneArgv() {
		buildLaneArgv(lane);
	}, /declares 2 TypeScript compiler runs; use buildTypeScriptCompilerRuns/);
});

test('normalizes Windows identity paths and resolves full-suite inventories from the harness root', async () => {
	assert.equal(
		toPortablePath('packages\\hook-form\\tests\\example.test.ts'),
		'packages/hook-form/tests/example.test.ts',
	);
	const root = await mkdtemp(join(tmpdir(), 'react-parity-root-'));
	await mkdir(join(root, 'audit'), { recursive: true });
	await writeFile(
		join(root, 'audit/inventory.json'),
		JSON.stringify({ files: ['packages/example.test.ts'] }),
	);
	const lane = {
		...manifest().lanes[0],
		execution: { kind: 'vitest-full', inventory: 'audit/inventory.json' },
	};
	assert.deepEqual(buildLaneArgv(lane, root).slice(5), [
		'packages/example.test.ts',
		'--reporter=./scripts/react-parity/vitest-json-reporter.mjs',
	]);
});

test('passes file parallelism through full Vitest lanes', async () => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-workers-'));
	await mkdir(join(root, 'audit'), { recursive: true });
	await writeFile(
		join(root, 'audit/inventory.json'),
		JSON.stringify({ files: ['packages/example.test.ts'] }),
	);
	const lane = {
		...manifest().lanes[0],
		evidenceOrigin: 'upstream-suite',
		execution: {
			kind: 'vitest-full',
			inventory: 'audit/inventory.json',
			fileParallelism: true,
		},
	};
	assert.deepEqual(validateManifest(manifest({ lanes: [lane] })).lanes[0], lane);
	assert.deepEqual(buildLaneArgv(lane, root).slice(3), [
		'--project',
		'hook-form',
		'--fileParallelism',
		'packages/example.test.ts',
		'--reporter=./scripts/react-parity/vitest-json-reporter.mjs',
	]);
	const invalidParallelism = structuredClone(lane);
	invalidParallelism.execution.fileParallelism = 'true';
	assert.throws(
		() => validateManifest(manifest({ lanes: [invalidParallelism] })),
		/fileParallelism must be boolean/,
	);
	const typeWithParallelism = typeLane('adapted-types');
	typeWithParallelism.execution.fileParallelism = true;
	assert.throws(
		() => validateManifest(manifest({ lanes: [typeWithParallelism] })),
		/fileParallelism is only valid for Vitest full-suite execution/,
	);
});

test('normalizes Vitest suite separators symmetrically when a title contains greater-than', async () => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-vitest-title-'));
	await mkdir(join(root, 'audit'), { recursive: true });
	const lane = {
		...manifest().lanes[0],
		execution: { kind: 'vitest-full', inventory: 'audit/inventory.json' },
	};
	await writeFile(
		join(root, 'audit/inventory.json'),
		JSON.stringify({
			files: ['example.test.ts'],
			tests: [{ file: 'example.test.ts', fullName: 'suite prints bytes when size 1' }],
		}),
	);
	const result = {
		testResults: [
			{
				name: join(root, 'example.test.ts'),
				assertionResults: [{ fullName: 'suite prints bytes when size > 1', status: 'passed' }],
			},
		],
	};
	assert.equal(verifyLaneRunResult(lane, JSON.stringify(result), root), true);
});

test('runs Jest full suites directly and rejects identity or snapshot drift', async () => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-jest-root-'));
	const lane = fullRuntimeLane('pristine-upstream');
	const inventory = {
		schemaVersion: 1,
		root: lane.execution.root,
		tests: [{ file: 'src/example.test.ts', fullName: 'suite works', status: 'passed' }],
		snapshots: 2,
	};
	await mkdir(join(root, 'audit'), { recursive: true });
	await writeFile(join(root, lane.execution.inventory), JSON.stringify(inventory));

	assert.deepEqual(buildLaneArgv(lane, root), [
		process.execPath,
		'scripts/react-parity/jest-full-runner.mjs',
		'--config',
		lane.execution.config,
		'--root',
		lane.execution.root,
	]);
	assert.equal(verifyLaneRunResult(lane, JSON.stringify(inventory), root), true);

	assert.throws(
		() => verifyLaneRunResult(lane, JSON.stringify({ ...inventory, tests: [] }), root),
		/did not execute every inventoried Jest identity exactly once/,
	);
	assert.throws(
		() => verifyLaneRunResult(lane, JSON.stringify({ ...inventory, snapshots: 1 }), root),
		/executed 1 of 2 inventoried snapshots/,
	);
	assert.throws(
		() => verifyLaneRunResult(lane, JSON.stringify({ tests: inventory.tests, snapshots: 2 }), root),
		/returned an invalid Jest full-suite result/,
	);
});

test('runs Node full suites directly and rejects leaf identity drift', async () => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-node-root-'));
	const lane = {
		...fullRuntimeLane('pristine-upstream'),
		execution: {
			kind: 'node-full',
			root: 'packages/example/upstream',
			file: 'packages/example/upstream/test.jsx',
			loader: 'packages/example/upstream/load-jsx.js',
			inventory: 'audit/pristine-upstream.json',
		},
	};
	const inventory = {
		schemaVersion: 1,
		root: lane.execution.root,
		tests: [{ file: lane.execution.file, fullName: 'suite works', status: 'passed' }],
		snapshots: 0,
	};
	await mkdir(join(root, 'audit'), { recursive: true });
	await writeFile(join(root, lane.execution.inventory), JSON.stringify(inventory));

	assert.deepEqual(buildLaneArgv(lane, root), [
		process.execPath,
		'scripts/react-parity/node-full-runner.mjs',
		'--root',
		lane.execution.root,
		'--file',
		lane.execution.file,
		'--loader',
		lane.execution.loader,
		'--inventory',
		lane.execution.inventory,
	]);
	assert.equal(
		verifyLaneRunResult(lane, JSON.stringify({ schemaVersion: 1, tests: inventory.tests }), root),
		true,
	);
	assert.throws(
		() => verifyLaneRunResult(lane, JSON.stringify({ schemaVersion: 1, tests: [] }), root),
		/did not execute every inventoried Node identity exactly once/,
	);
});

test('sorts test identities by locale-independent code-unit order', () => {
	const identities = [
		{ file: 'test.ts', fullName: 'z' },
		{ file: 'test.ts', fullName: '_underscore' },
		{ file: 'test.ts', fullName: 'Alpha' },
	];
	assert.deepEqual(
		identities.sort(compareTestIdentities).map(({ fullName }) => fullName),
		['Alpha', '_underscore', 'z'],
	);
});

test('accepts standard TypeScript for plain adapted type suites', () => {
	const lane = typeLane('adapted-types');
	lane.execution.compiler = 'tsc';
	assert.doesNotThrow(() => validateManifest(manifest({ lanes: [lane] })));
});

test('rejects adapted type evidence that bypasses a supported TypeScript compiler', () => {
	const lane = {
		...manifest().lanes[0],
		id: 'adapted-types',
		type: 'adapted-types',
		evidenceOrigin: 'upstream-suite',
		execution: {
			kind: 'typescript',
			compiler: 'tsgo',
			project: 'packages/example/typetests/tsconfig.json',
		},
	};
	assert.throws(
		() => validateManifest(manifest({ lanes: [lane] })),
		/adapted-types execution must use tsc or tsrx-tsc/,
	);
});

test('matches the exact Vitest full name instead of another title with the same suffix', () => {
	const pattern = new RegExp(buildLaneArgv(manifest().lanes[0])[6]);
	assert.equal(pattern.test('example suite does the thing'), true);
	assert.equal(pattern.test('other suite example suite does the thing'), false);
});

test('rejects a stale fullName that Vitest does not collect from its evidence file', () => {
	const value = manifest();
	const root = '/repo';
	assert.throws(
		() =>
			verifyLaneCollectedTests(
				value.lanes[0],
				[
					{
						name: 'example suite renamed the thing',
						file: '/repo/packages/hook-form/tests/upstream/example.test.ts',
					},
				],
				root,
			),
		/fullName must match exactly one collected Vitest test/,
	);
});

test('jotai exact selection fails closed when a declared case is renamed', async () => {
	const value = await loadManifest('packages/jotai/audit/react-parity.json');
	await assert.doesNotReject(() => verifyManifestTestSelections(value, process.cwd()));

	const renamed = structuredClone(value);
	renamed.lanes[0].files[0].cases[0].fullName += ' renamed';
	await assert.rejects(
		() => verifyManifestTestSelections(renamed, process.cwd()),
		/fullName must match exactly one collected Vitest test/,
	);
});

test('rejects duplicate lane and case ids', () => {
	const duplicateLane = manifest({ lanes: [manifest().lanes[0], manifest().lanes[0]] });
	assert.throws(() => validateManifest(duplicateLane), /duplicate lane id "adapted"/);

	const duplicateCase = manifest();
	duplicateCase.lanes[0].files[0].cases.push({
		id: 'adapted:example',
		testName: 'again',
		fullName: 'example suite again',
	});
	assert.throws(() => validateManifest(duplicateCase), /duplicate case id "adapted:example"/);
});

test('rejects lanes without executable cases', () => {
	const value = manifest();
	value.lanes[0].files = [
		{
			path: 'packages/hook-form/tests/upstream/helper.ts',
			role: 'support',
			sha256: sha256('helper'),
		},
	];
	assert.throws(() => validateManifest(value), /must declare at least one executable case/);
	assert.throws(() => buildLaneArgv(value.lanes[0]), /has no executable cases/);
});

test('rejects broad file patterns, regex skips, and raw shell commands', () => {
	for (const path of ['packages/**/*.test.ts', 'packages/hook-form/tests/.*', '/test\\.ts$/']) {
		const value = manifest();
		value.lanes[0].files[0].path = path;
		assert.throws(() => validateManifest(value), /exact relative file path/);
	}
	const value = manifest();
	value.lanes[0].command = 'pnpm test && echo passed';
	assert.throws(() => validateManifest(value), /unknown key "command"/);
});

test('rejects root Vitest config hashes as support evidence', () => {
	for (const path of ['vitest.config.js', './vitest.config.js']) {
		const value = manifest();
		value.lanes[0].files.push({ path, role: 'support', sha256: sha256('config') });
		assert.throws(
			() => validateManifest(value),
			/cannot hash root vitest\.config\.js as support evidence/,
		);
	}

	const supported = manifest();
	supported.lanes[0].files.push({
		path: 'packages/example/vitest.setup.ts',
		role: 'support',
		sha256: sha256('setup'),
	});
	assert.doesNotThrow(() => validateManifest(supported));
});

test('requires complete immutable provenance and environment identity', () => {
	for (const field of [
		'repo',
		'version',
		'commit',
		'sourceRoot',
		'testRoot',
		'license',
		'integrity',
	]) {
		const value = manifest();
		delete value.provenance[field];
		assert.throws(() => validateManifest(value), new RegExp(`provenance\\.${field}`));
	}
	const value = manifest();
	delete value.environments.local.lockfile;
	assert.throws(() => validateManifest(value), /environments\.local\.lockfile/);

	const shortCommit = manifest();
	shortCommit.provenance.commit = 'b7df98c2';
	assert.throws(() => validateManifest(shortCommit), /full 40-character Git commit/);

	const partialIntegrity = manifest();
	partialIntegrity.provenance.integrity = 'sha256:0123456789abcdef';
	assert.throws(() => validateManifest(partialIntegrity), /complete sha256 digest/);

	const missingRuntimeSummary = manifest();
	delete missingRuntimeSummary.adaptedRuntimeSummary;
	assert.throws(() => validateManifest(missingRuntimeSummary), /adaptedRuntimeSummary/);
});

test('makes every upstream runtime suite state an executable verified requirement', () => {
	const present = verifiedManifest();
	assert.doesNotThrow(() => validateManifest(present));

	const focusedPristine = structuredClone(present);
	focusedPristine.lanes[0] = {
		...manifest().lanes[0],
		id: 'focused-pristine-upstream',
		type: 'pristine-upstream',
	};
	assert.throws(
		() => validateManifest(focusedPristine),
		/present upstream runtime tests requires required full pristine-upstream and adapted-octane lanes with upstream-suite evidence/,
	);

	for (const mutation of [
		(candidate) => (candidate.lanes[1].oracle = 'optional'),
		(candidate) => (candidate.lanes[1].available = false),
		(candidate) => (candidate.lanes[1].evidenceOrigin = 'repo-authored'),
	]) {
		const invalidPresent = structuredClone(present);
		mutation(invalidPresent);
		assert.throws(
			() => validateManifest(invalidPresent),
			/present upstream runtime tests requires required full pristine-upstream and adapted-octane lanes with upstream-suite evidence/,
		);
	}

	const insufficient = structuredClone(present);
	insufficient.upstreamSuites.runtime = 'insufficient';
	assert.throws(
		() => validateManifest(insufficient),
		/insufficient upstream runtime tests requires full upstream-suite lanes plus repo-authored differential evidence/,
	);
	insufficient.lanes.push(differentialLane());
	assert.doesNotThrow(() => validateManifest(insufficient));

	const missingInsufficientPristine = structuredClone(insufficient);
	missingInsufficientPristine.lanes = missingInsufficientPristine.lanes.filter(
		(lane) => lane.type !== 'pristine-upstream',
	);
	assert.throws(
		() => validateManifest(missingInsufficientPristine),
		/insufficient upstream runtime tests requires full upstream-suite lanes plus repo-authored differential evidence/,
	);

	const absent = structuredClone(present);
	absent.upstreamSuites.runtime = 'absent';
	absent.lanes = absent.lanes.filter(
		(lane) => lane.type !== 'pristine-upstream' && lane.type !== 'adapted-octane',
	);
	assert.throws(
		() => validateManifest(absent),
		/absent upstream runtime tests requires differential lanes with repo-authored evidence/,
	);
	absent.lanes.push(differentialLane());
	assert.doesNotThrow(() => validateManifest(absent));
});

test('requires paired executable type lanes only when upstream type evidence exists', () => {
	const value = verifiedManifest();
	for (const mutation of [
		(candidate) =>
			candidate.lanes.splice(
				candidate.lanes.findIndex((lane) => lane.type === 'adapted-types'),
				1,
			),
		(candidate) =>
			(candidate.lanes.find((lane) => lane.type === 'pristine-types').oracle = 'optional'),
		(candidate) =>
			(candidate.lanes.find((lane) => lane.type === 'adapted-types').available = false),
	]) {
		const invalidTypes = structuredClone(value);
		mutation(invalidTypes);
		assert.throws(
			() => validateManifest(invalidTypes),
			/requires available required pristine-types and adapted-types lanes with upstream-suite evidence/,
		);
	}

	for (const suiteState of ['insufficient']) {
		const repoAuthored = structuredClone(value);
		repoAuthored.upstreamSuites.types = suiteState;
		for (const lane of repoAuthored.lanes.filter((candidate) => candidate.type.endsWith('-types')))
			lane.evidenceOrigin = 'repo-authored';
		assert.doesNotThrow(() => validateManifest(repoAuthored));

		const fakeDifferential = structuredClone(repoAuthored);
		fakeDifferential.lanes = fakeDifferential.lanes.filter((lane) => !lane.type.endsWith('-types'));
		fakeDifferential.lanes.push({
			...manifest().lanes[0],
			id: 'fake-type-differential',
			type: 'differential',
			evidenceOrigin: 'repo-authored',
			files: [
				{
					...manifest().lanes[0].files[0],
					cases: [
						{
							id: 'types:fake-runtime-case',
							testName: 'fake type case',
							fullName: 'fake type case',
						},
					],
				},
			],
		});
		assert.throws(
			() => validateManifest(fakeDifferential),
			new RegExp(`with ${suiteState} upstream type tests.*repo-authored evidence`),
		);

		const wrongOrigin = structuredClone(repoAuthored);
		wrongOrigin.lanes.find((lane) => lane.type === 'adapted-types').evidenceOrigin =
			'upstream-suite';
		assert.throws(
			() => validateManifest(wrongOrigin),
			new RegExp(`with ${suiteState} upstream type tests.*repo-authored evidence`),
		);
	}

	const absent = structuredClone(value);
	absent.upstreamSuites.types = 'absent';
	absent.lanes = absent.lanes.filter((lane) => !lane.type.endsWith('-types'));
	assert.doesNotThrow(() => validateManifest(absent));
	const synthetic = structuredClone(absent);
	synthetic.lanes.push(typeLane('pristine-types'));
	assert.throws(
		() => validateManifest(synthetic),
		/absent upstream type tests requires available required pristine-types and adapted-types lanes with repo-authored evidence when type lanes are declared/,
	);
});

test('requires explicit type evidence origins and supported compilers', () => {
	for (const type of ['pristine-types', 'adapted-types']) {
		const value = manifest();
		value.lanes[0] = {
			...value.lanes[0],
			type,
			evidenceOrigin: 'upstream-suite',
			execution: {
				kind: 'typescript',
				compiler: type === 'pristine-types' ? 'tsc' : 'tsrx-tsc',
				project: 'packages/example/tsconfig.json',
			},
		};
		assert.doesNotThrow(() => validateManifest(value));

		const missingOrigin = structuredClone(value);
		delete missingOrigin.lanes[0].evidenceOrigin;
		assert.throws(() => validateManifest(missingOrigin), /type evidenceOrigin/);

		const wrongCompiler = structuredClone(value);
		wrongCompiler.lanes[0].execution.compiler = type === 'pristine-types' ? 'tsrx-tsc' : 'tsgo';
		assert.throws(
			() => validateManifest(wrongCompiler),
			new RegExp(
				`${type} execution must use ${type === 'pristine-types' ? 'tsc' : 'tsc or tsrx-tsc'}`,
			),
		);
	}

	const runtimeLane = manifest();
	runtimeLane.lanes[0].evidenceOrigin = 'repo-authored';
	assert.throws(
		() => validateManifest(runtimeLane),
		/non-type lane must not declare evidenceOrigin/,
	);

	const fullRuntime = fullRuntimeLane('adapted-octane');
	delete fullRuntime.evidenceOrigin;
	assert.throws(
		() => validateManifest(manifest({ lanes: [fullRuntime] })),
		/full runtime evidenceOrigin/,
	);

	const adaptedJest = fullRuntimeLane('pristine-upstream');
	adaptedJest.type = 'adapted-octane';
	assert.throws(
		() => validateManifest(manifest({ lanes: [adaptedJest] })),
		/jest-full execution is only valid for pristine-upstream lanes/,
	);
});

test('evaluates exact and minimum Node major requirements', () => {
	assert.equal(nodeMajorSatisfies('>=22', 22), true);
	assert.equal(nodeMajorSatisfies('>=22', 24), true);
	assert.equal(nodeMajorSatisfies('>=22', 20), false);
	assert.equal(nodeMajorSatisfies('22', 22), true);
	assert.equal(nodeMajorSatisfies('22', 24), false);
	assert.throws(() => nodeMajorSatisfies('^22', 22), /Unsupported Node requirement/);
});

test('rejects stale divergences and accepts one divergence matching multiple known cases', () => {
	const stale = manifest({
		divergences: [divergence({ caseIds: ['missing'] })],
	});
	assert.throws(() => validateManifest(stale), /unknown case id "missing"/);

	const ordinary = manifest({
		ordinaryEvidence: [
			{
				path: 'packages/example/tests/ordinary-contract.test.ts',
				sha256: sha256('ordinary contract'),
				cases: [
					{
						id: 'conformance:ordinary-contract',
						testName: 'documents the ordinary contract',
						fullName: 'ordinary contract documents the ordinary contract',
					},
				],
			},
		],
		divergences: [divergence({ caseIds: ['conformance:ordinary-contract'] })],
	});
	assert.deepEqual(validateManifest(ordinary), ordinary);

	const broad = manifest();
	broad.lanes[0].files[0].cases.push({
		id: 'adapted:other',
		testName: 'does the other thing',
		fullName: 'example suite does the other thing',
	});
	broad.divergences = [divergence({ caseIds: ['adapted:example', 'adapted:other'] })];
	assert.deepEqual(validateManifest(broad), broad);

	for (const field of [
		'upstreamResult',
		'octaneResult',
		'rationale',
		'classification',
		'consumerImpact',
		'migrationGuidance',
		'owner',
		'reviewCondition',
	]) {
		const incomplete = manifest({ divergences: [divergence()] });
		delete incomplete.divergences[0][field];
		assert.throws(() => validateManifest(incomplete), new RegExp(field));
	}
});

test('accepts ordinary audit identities for divergences outside parity lanes', () => {
	const ordinary = divergence({
		caseIds: ['ordinary:view-boundary'],
		ordinaryEvidence: [
			{
				id: 'ordinary:view-boundary',
				path: 'packages/example/tests/view-boundary.test.ts',
				sha256: sha256('boundary'),
				testName: 'documents the boundary',
				fullName: 'View boundary documents the boundary',
			},
		],
	});
	assert.deepEqual(
		validateManifest(manifest({ divergences: [ordinary] })),
		manifest({ divergences: [ordinary] }),
	);

	assert.throws(
		() =>
			validateManifest(
				manifest({
					divergences: [
						divergence({
							caseIds: ['ordinary:view-boundary'],
						}),
					],
				}),
			),
		/unknown case id "ordinary:view-boundary"/,
	);

	assert.throws(
		() =>
			validateManifest(
				manifest({
					divergences: [
						divergence({
							caseIds: ['ordinary:view-boundary'],
							ordinaryEvidence: [
								{
									id: 'adapted:example',
									path: 'packages/example/tests/view-boundary.test.ts',
									sha256: sha256('boundary'),
									testName: 'documents the boundary',
									fullName: 'View boundary documents the boundary',
								},
							],
						}),
					],
				}),
			),
		/must start with "ordinary:"/,
	);
});

test('rejects missing and tampered evidence files', async () => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-'));
	const value = manifest();
	await assert.rejects(() => verifyManifestFiles(value, root), /missing evidence file/);

	const file = join(root, value.lanes[0].files[0].path);
	await mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true });
	await writeFile(file, 'tampered');
	await assert.rejects(() => verifyManifestFiles(value, root), /integrity mismatch/);
});

test('rejects a selected lane that repeats identities already owned by a full-suite lane', async () => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-overlap-'));
	const sourcePath = 'packages/example/tests/upstream/example.test.ts';
	const inventoryPath = 'packages/example/audit/adapted-runtime.json';
	const source = '// @parity-case adapted:example\n' + 'test("does the thing", () => {})\n';
	const inventory = JSON.stringify({
		schemaVersion: 1,
		project: 'example',
		roots: ['packages/example/tests/upstream'],
		files: [sourcePath],
		tests: [
			{
				id: 'runtime:example',
				file: sourcePath,
				fullName: 'example suite does the thing',
			},
		],
	});
	await mkdir(join(root, 'packages/example/tests/upstream'), { recursive: true });
	await mkdir(join(root, 'packages/example/audit'), { recursive: true });
	await writeFile(join(root, sourcePath), source);
	await writeFile(join(root, inventoryPath), inventory);

	const selected = manifest().lanes[0];
	selected.project = 'example';
	selected.files[0] = {
		...selected.files[0],
		path: sourcePath,
		sha256: sha256(source),
	};
	const full = {
		...fullRuntimeLane('adapted-octane'),
		project: 'example',
		files: [{ path: inventoryPath, role: 'support', sha256: sha256(inventory) }],
		execution: { kind: 'vitest-full', inventory: inventoryPath },
	};
	const value = manifest({
		adaptedRoots: {
			source: {
				roots: ['packages/example/tests/upstream'],
				include: ['\\.ts$'],
				exclude: [],
			},
			tests: {
				roots: ['packages/example/tests/upstream'],
				include: ['\\.test\\.ts$'],
				exclude: [],
			},
		},
		adaptedRuntimeSummary: {
			inventoryEntries: 1,
			uniqueIdentities: 1,
			duplicateEntriesWithinLanes: 0,
			identitiesSharedAcrossLanes: 0,
		},
		lanes: [full, selected],
	});

	await assert.rejects(
		() => verifyManifestFiles(validateManifest(value), root),
		/lane adapted repeats 1 test identities already executed by full-suite lane full-adapted-octane/,
	);
});

test('rejects unstructured, undeclared, and unlinked full-suite divergences', async () => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-divergence-'));
	const sourcePath = 'packages/example/tests/upstream/example.test.ts';
	const inventoryPath = 'packages/example/audit/adapted-runtime.json';
	await mkdir(join(root, 'packages/example/tests/upstream'), { recursive: true });
	await mkdir(join(root, 'packages/example/audit'), { recursive: true });
	const makeValue = (source, divergences) => {
		const inventory = JSON.stringify({
			schemaVersion: 1,
			project: 'example',
			roots: ['packages/example/tests/upstream'],
			files: [sourcePath],
			tests: [{ id: 'runtime:example', file: sourcePath, fullName: 'suite works' }],
		});
		return {
			inventory,
			value: manifest({
				adaptedRuntimeSummary: {
					inventoryEntries: 1,
					uniqueIdentities: 1,
					duplicateEntriesWithinLanes: 0,
					identitiesSharedAcrossLanes: 0,
				},
				adaptedRoots: {
					source: {
						roots: ['packages/example/tests/upstream'],
						include: ['\\.ts$'],
						exclude: [],
					},
					tests: {
						roots: ['packages/example/tests/upstream'],
						include: ['\\.test\\.ts$'],
						exclude: [],
					},
				},
				lanes: [
					{
						...manifest().lanes[0],
						id: 'full',
						project: 'example',
						evidenceOrigin: 'upstream-suite',
						files: [{ path: inventoryPath, role: 'support', sha256: sha256(inventory) }],
						execution: { kind: 'vitest-full', inventory: inventoryPath },
					},
				],
				divergences,
			}),
		};
	};

	let fixture = makeValue('test("works", () => {})\n', []);
	fixture.value.adaptedRuntimeSummary.inventoryEntries = 2;
	await writeFile(join(root, sourcePath), 'test("works", () => {})\n');
	await writeFile(join(root, inventoryPath), fixture.inventory);
	await assert.rejects(
		() => verifyManifestFiles(validateManifest(fixture.value), root),
		/adapted runtime inventory summary drifted/,
	);

	fixture = makeValue('// OCTANE DIVERGENCE: old form\ntest("works", () => {})\n', []);
	await writeFile(
		join(root, sourcePath),
		'// OCTANE DIVERGENCE: old form\ntest("works", () => {})\n',
	);
	await writeFile(join(root, inventoryPath), fixture.inventory);
	await assert.rejects(
		() => verifyManifestFiles(validateManifest(fixture.value), root),
		/must use OCTANE DIVERGENCE\[id\]/,
	);

	const declared = divergence({ id: 'declared', caseIds: ['runtime:example'] });
	fixture = makeValue('// no marker\ntest("works", () => {})\n', [declared]);
	await writeFile(join(root, sourcePath), '// no marker\ntest("works", () => {})\n');
	await writeFile(join(root, inventoryPath), fixture.inventory);
	await assert.rejects(
		() => verifyManifestFiles(validateManifest(fixture.value), root),
		/has no structured source or test marker/,
	);

	await writeFile(
		join(root, 'packages/example/tests/upstream/unlisted.test.ts'),
		'test("unlisted", () => {})\n',
	);
	await assert.rejects(
		() => verifyManifestFiles(validateManifest(fixture.value), root),
		/adapted test roots drifted from the union of full-suite inventories/,
	);
});

test('discovers divergence markers in tsrx source roots independently from test inventories', async () => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-tsrx-divergence-'));
	const componentPath = 'packages/example/src/component.tsrx';
	const sourcePath = 'packages/example/tests/upstream/example.test.ts';
	const inventoryPath = 'packages/example/audit/adapted-runtime.json';
	const testSource = 'test("works", () => {})\n';
	const inventory = JSON.stringify({
		schemaVersion: 1,
		project: 'example',
		roots: ['packages/example/tests/upstream'],
		files: [sourcePath],
		tests: [{ id: 'runtime:example', file: sourcePath, fullName: 'works' }],
	});
	const value = manifest({
		adaptedRuntimeSummary: {
			inventoryEntries: 1,
			uniqueIdentities: 1,
			duplicateEntriesWithinLanes: 0,
			identitiesSharedAcrossLanes: 0,
		},
		adaptedRoots: {
			source: {
				roots: ['packages/example/src'],
				include: ['\\.tsrx$'],
				exclude: [],
			},
			tests: {
				roots: ['packages/example/tests/upstream'],
				include: ['\\.test\\.ts$'],
				exclude: [],
			},
		},
		lanes: [
			{
				...manifest().lanes[0],
				id: 'full',
				project: 'example',
				evidenceOrigin: 'upstream-suite',
				files: [{ path: inventoryPath, role: 'support', sha256: sha256(inventory) }],
				execution: { kind: 'vitest-full', inventory: inventoryPath },
			},
		],
	});

	await mkdir(join(root, 'packages/example/src'), { recursive: true });
	await mkdir(join(root, 'packages/example/tests/upstream'), { recursive: true });
	await mkdir(join(root, 'packages/example/audit'), { recursive: true });
	await writeFile(
		join(root, componentPath),
		'// OCTANE DIVERGENCE[undeclared][runtime:example]: source-level difference\n',
	);
	await writeFile(join(root, sourcePath), testSource);
	await writeFile(join(root, 'packages/example/tests/upstream/fixture.tsrx'), '<div />\n');
	await writeFile(join(root, inventoryPath), inventory);

	await assert.rejects(
		() => verifyManifestFiles(validateManifest(value), root),
		/undeclared divergence marker "undeclared"/,
	);
});

test('rejects environment drift during validation', async () => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-environment-'));
	const value = manifest();
	await writeFile(join(root, 'pnpm-lock.yaml'), 'changed lockfile');
	await assert.rejects(
		() => verifyLaneEnvironment(value, value.lanes[0], root, '11.15.1'),
		/lockfile integrity mismatch/,
	);
});

test('matches parity markers by exact id instead of shared prefix', async () => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-markers-'));
	const value = manifest();
	const source = `
// @parity-case adapted:example
it('does the thing', () => {});
// @parity-case adapted:example-extra
it('does the extra thing', () => {});
`;
	value.lanes[0].files[0].cases.push({
		id: 'adapted:example-extra',
		testName: 'does the extra thing',
		fullName: 'example suite does the extra thing',
	});
	value.lanes[0].files[0].sha256 = sha256(source);
	const file = join(root, value.lanes[0].files[0].path);
	await mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true });
	await writeFile(file, source);
	await assert.doesNotReject(() => verifyManifestFiles(value, root));
});

test('requires a parity marker to bind to the immediately following exact test', async () => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-neighbor-'));
	const value = manifest();
	const source = `
// @parity-case adapted:example
it('a neighboring test', () => {});
it('does the thing', () => {});
`;
	value.lanes[0].files[0].sha256 = sha256(source);
	const file = join(root, value.lanes[0].files[0].path);
	await mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true });
	await writeFile(file, source);
	await assert.rejects(
		() => verifyManifestFiles(value, root),
		/must immediately precede one active test named "does the thing"/,
	);
});

test('an unavailable optional oracle is never reported as parity evidence', () => {
	const value = manifest();
	value.lanes[0].oracle = 'optional';
	value.lanes[0].available = false;
	assert.throws(
		() => buildLaneArgv(value.lanes[0]),
		/optional oracle is unavailable; parity not established/,
	);
});

test('conformance case ids authenticate structured divergences without a parity lane', async () => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-conformance-divergence-'));
	const probePath = 'packages/example/tests/optional/divergence.test.ts';
	const requiredPath = 'packages/example/tests/required/required.test.ts';
	await mkdir(join(root, 'packages/example/src'), { recursive: true });
	await mkdir(join(root, 'packages/example/tests/optional'), { recursive: true });
	await mkdir(join(root, 'packages/example/tests/required'), { recursive: true });
	const probeSource =
		'// OCTANE DIVERGENCE[example-divergence][conformance:example]\n' +
		'// @parity-case conformance:example\n' +
		'it("does the thing", () => {})\n';
	const skippedSource =
		'// OCTANE DIVERGENCE[example-divergence][conformance:example]\n' +
		'// @parity-case conformance:example\n' +
		'it.skip("is disabled", () => {})\n';
	const requiredSource =
		'// @parity-case differential:required\n' + 'it("stays required", () => {})\n';
	await writeFile(join(root, probePath), probeSource);
	await writeFile(join(root, requiredPath), requiredSource);
	const value = manifest({
		adaptedRoots: {
			source: {
				roots: ['packages/example/src'],
				include: ['\\.ts$'],
				exclude: [],
			},
			tests: {
				roots: ['packages/example/tests'],
				include: ['\\.test\\.ts$'],
				exclude: [],
			},
		},
		lanes: [
			{
				...manifest().lanes[0],
				id: 'required-differential',
				type: 'differential',
				oracle: 'required',
				evidenceOrigin: 'repo-authored',
				files: [
					{
						path: requiredPath,
						role: 'test',
						sha256: sha256(requiredSource),
						cases: [
							{
								id: 'differential:required',
								testName: 'stays required',
								fullName: 'example suite stays required',
							},
						],
					},
				],
			},
		],
		ordinaryEvidence: [
			{
				path: probePath,
				sha256: sha256(probeSource),
				cases: [
					{
						id: 'conformance:example',
						testName: 'does the thing',
						fullName: 'example suite does the thing',
					},
				],
			},
		],
		divergences: [divergence({ id: 'example-divergence', caseIds: ['conformance:example'] })],
	});
	assert.deepEqual(validateManifest(value), value);
	assert.deepEqual(
		requiredExecutableLanes(value).map((lane) => lane.id),
		['required-differential'],
	);
	await assert.doesNotReject(() => verifyManifestFiles(validateManifest(value), root));

	await writeFile(join(root, probePath), skippedSource);
	const skippedValue = structuredClone(value);
	skippedValue.ordinaryEvidence[0].sha256 = sha256(skippedSource);
	await assert.rejects(
		() => verifyManifestFiles(validateManifest(skippedValue), root),
		/must immediately precede one active test/,
	);
});

test('rejects additional properties at every strict manifest level', () => {
	for (const mutate of [
		(value) => (value.extra = true),
		(value) => (value.provenance.extra = true),
		(value) => (value.environments.local.extra = true),
		(value) => (value.lanes[0].files[0].extra = true),
		(value) => (value.divergences = [divergence({ extra: true })]),
	]) {
		const value = manifest();
		mutate(value);
		assert.throws(() => validateManifest(value), /unknown key/);
	}
	const value = manifest({ environments: {} });
	assert.throws(() => validateManifest(value), /environments must be non-empty/);
});

test('CLI validates, lists, and rejects malformed invocations', () => {
	const cli = join(import.meta.dirname, 'harness.mjs');
	const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
	// Exercise validation through a non-Vitest lane. Real project collection is
	// integration work owned by the parity job, not a unit-test side effect.
	assert.equal(run('validate', '--lane', 'hook-form-pristine-types').status, 0);
	const listed = run('list');
	assert.equal(listed.status, 0);
	assert.match(listed.stdout, /hook-form-pristine-upstream.*verified/);
	for (const args of [
		['wat'],
		['validate', '--wat', 'x'],
		['validate', '--manifest'],
		['run', '--lane'],
		['run', '--lane', 'missing'],
	]) {
		assert.notEqual(run(...args).status, 0, args.join(' '));
	}
});
