import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { generateLockfileIntegrity } from './generate-lockfile-integrity.mjs';
import { loadRequiredVitestLanes } from './vitest-batch-lib.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function manifest(lockfile = 'pnpm-lock.yaml') {
	return {
		schemaVersion: 1,
		provenance: {
			repo: 'https://example.test/upstream.git',
			version: '1.0.0',
			commit: '0'.repeat(40),
			sourceRoot: 'src',
			testRoot: 'tests',
			license: 'MIT',
			integrity: `sha256:${'0'.repeat(64)}`,
			verification: 'recorded-unverified',
		},
		upstreamSuites: { runtime: 'absent', types: 'absent' },
		adaptedRoots: {
			source: { roots: ['packages/example/src'], include: ['\\.ts$'], exclude: [] },
			tests: { roots: ['packages/example/tests'], include: ['\\.test\\.ts$'], exclude: [] },
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
				lockfile,
				lockfileSha256: '0'.repeat(64),
			},
		},
		lanes: [
			{
				id: 'adapted',
				type: 'adapted-octane',
				oracle: 'required',
				environment: 'local',
				project: 'example',
				files: [
					{
						path: 'packages/example/tests/example.test.ts',
						role: 'test',
						sha256: '0'.repeat(64),
						cases: [{ id: 'adapted:example', testName: 'works', fullName: 'works' }],
					},
				],
			},
		],
		divergences: [],
	};
}

async function fixture(value = manifest()) {
	const root = await mkdtemp(path.join(tmpdir(), 'react-parity-lockfile-'));
	const manifestPath = path.join(root, 'packages/example/audit/react-parity.json');
	await mkdir(path.dirname(manifestPath), { recursive: true });
	await writeFile(manifestPath, `${JSON.stringify(value, null, 2)}\n`);
	return { manifestPath, root };
}

test('refreshes discovered lockfile integrity and is idempotent', async (t) => {
	const { manifestPath, root } = await fixture();
	t.after(() => rm(root, { recursive: true, force: true }));
	const lockfile = 'lockfileVersion: 9\n';
	await writeFile(path.join(root, 'pnpm-lock.yaml'), lockfile);
	const original = await readFile(manifestPath, 'utf8');

	assert.deepEqual(await generateLockfileIntegrity(root), [
		{ changed: true, path: 'packages/example/audit/react-parity.json' },
	]);
	const generated = JSON.parse(await readFile(manifestPath, 'utf8'));
	assert.equal(generated.environments.local.lockfileSha256, sha256(lockfile));
	const firstOutput = await readFile(manifestPath, 'utf8');
	assert.equal(
		firstOutput,
		original.replace(
			`"lockfileSha256": "${'0'.repeat(64)}"`,
			`"lockfileSha256": "${sha256(lockfile)}"`,
		),
	);

	assert.deepEqual(await generateLockfileIntegrity(root), [
		{ changed: false, path: 'packages/example/audit/react-parity.json' },
	]);
	assert.equal(await readFile(manifestPath, 'utf8'), firstOutput);
});

test('rejects lockfiles outside the repository', async (t) => {
	const { root } = await fixture(manifest('../outside-lock.yaml'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await assert.rejects(
		() => generateLockfileIntegrity(root),
		/React parity lockfile must stay inside the repository/,
	);
});

test('discovers focused imported evidence and refreshes its lockfile only with validated source ownership', async (t) => {
	const value = manifest();
	value.provenance.verification = 'verified';
	value.upstreamSuites = { runtime: 'present', types: 'present' };
	value.lanes[0].type = 'differential';
	value.lanes[0].evidenceOrigin = 'repo-authored';
	value.lanes.push({
		...structuredClone(value.lanes[0]),
		id: 'public-types',
		type: 'adapted-types',
		files: [
			{
				path: 'packages/example/tests/public-types.ts',
				role: 'test',
				sha256: '0'.repeat(64),
				cases: [{ id: 'types:public', testName: 'public types', fullName: 'public types' }],
			},
		],
		execution: {
			kind: 'typescript',
			compiler: 'tsrx-tsc',
			project: 'packages/example/tsconfig.json',
		},
	});
	const { root, manifestPath } = await fixture(value);
	t.after(() => rm(root, { recursive: true, force: true }));
	const packageRoot = path.join(root, 'packages/example');
	await mkdir(path.join(packageRoot, 'src'));
	await writeFile(
		path.join(packageRoot, 'package.json'),
		JSON.stringify({ exports: './src/index.ts', dependencies: { widget: '1.0.0' } }),
	);
	await writeFile(path.join(packageRoot, 'src/index.ts'), "export * from 'widget';\n");
	await writeFile(path.join(packageRoot, 'consumer.test.ts'), 'export const evidence = true;');
	await writeFile(
		path.join(packageRoot, 'status.json'),
		JSON.stringify({
			surfaces: [
				{
					entrypoint: '.',
					exports: ['*'],
					ownership: 'imported',
					files: ['src/index.ts'],
					dependency: { package: 'widget', version: '1.0.0' },
					evidence: ['consumer.test.ts'],
				},
			],
		}),
	);
	const lockfile = 'lockfileVersion: 9\n';
	await writeFile(path.join(root, 'pnpm-lock.yaml'), lockfile);
	assert.deepEqual(
		(await loadRequiredVitestLanes(root)).map((lane) => lane.id),
		['adapted'],
	);
	assert.deepEqual(await generateLockfileIntegrity(root), [
		{ changed: true, path: 'packages/example/audit/react-parity.json' },
	]);
	const generated = await readFile(manifestPath, 'utf8');
	assert.equal(JSON.parse(generated).environments.local.lockfileSha256, sha256(lockfile));

	await writeFile(
		path.join(packageRoot, 'src/index.ts'),
		"export * from 'widget';\nstartEngine();\n",
	);
	await assert.rejects(async () => loadRequiredVitestLanes(root), /Invalid binding surface policy/);
	await assert.rejects(() => generateLockfileIntegrity(root), /Invalid binding surface policy/);
	assert.equal(await readFile(manifestPath, 'utf8'), generated);

	await writeFile(path.join(packageRoot, 'src/index.ts'), "export * from 'widget';\n");
	value.lanes.pop();
	await writeFile(manifestPath, JSON.stringify(value));
	await assert.rejects(async () => loadRequiredVitestLanes(root), /public type evidence/);
	await assert.rejects(() => generateLockfileIntegrity(root), /public type evidence/);

	await rm(path.join(packageRoot, 'status.json'));
	await assert.rejects(async () => loadRequiredVitestLanes(root), /full pristine-upstream/);
	await assert.rejects(() => generateLockfileIntegrity(root), /full pristine-upstream/);
});
