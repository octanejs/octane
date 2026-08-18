import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { generateLockfileIntegrity } from './generate-lockfile-integrity.mjs';

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
