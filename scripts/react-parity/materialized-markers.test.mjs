import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
	fixtureIdentity,
	fixtureTreeEntries,
} from '../react-port/__fixtures__/materialize-fixtures.mjs';
import { buildUpstreamLock } from '../react-port/materialize-lib.mjs';
import { verifyMaterializedAdaptedEvidence } from './materialized-upstream-lib.mjs';
import {
	summarizeRuntimeInventories,
	validateManifest,
	verifyManifestFiles,
} from './harness-lib.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const packagePath = 'packages/example';
const adaptedPath = `${packagePath}/tests/upstream/example.test.ts`;
const pristinePath = `${packagePath}/upstream/tests/example.test.ts`;

function fixture(t, marker = 'native-events') {
	const root = mkdtempSync(join(tmpdir(), 'materialized-parity-markers-'));
	t.after(() => rmSync(root, { force: true, recursive: true }));
	const write = (file, bytes) => {
		mkdirSync(dirname(join(root, file)), { recursive: true });
		writeFileSync(join(root, file), bytes);
	};
	const source = "test('works', () => check('upstream'));\n";
	const adapted = `// OCTANE DIVERGENCE[${marker}]: observe native events.\ntest('works', () => check('native'));\n`;
	const lock = buildUpstreamLock({
		identity: fixtureIdentity(),
		license: { spdx: 'MIT' },
		treeEntries: fixtureTreeEntries(new Map([['tests/example.test.ts', source]])),
		adaptedMappings: [{ fromRoot: 'tests', toRoot: 'tests/upstream' }],
	});
	write(`${packagePath}/audit/upstream.lock.json`, JSON.stringify(lock));
	write(pristinePath, source);
	write(adaptedPath, adapted);
	write(`${packagePath}/src/index.ts`, 'export {};\n');
	write(
		`${packagePath}/audit/upstream-patches/tests/upstream/example.test.ts.patch`,
		`--- a/tests/upstream/example.test.ts\n+++ b/tests/upstream/example.test.ts\n@@ -1 +1,2 @@\n-${source}+${adapted.split('\n').filter(Boolean).join('\n+')}\n`,
	);
	const inventory = {
		schemaVersion: 1,
		project: 'example',
		roots: [`${packagePath}/tests/upstream`],
		files: [adaptedPath],
		tests: [{ id: 'runtime:example', file: adaptedPath, fullName: 'works' }],
	};
	const inventoryPath = `${packagePath}/audit/runtime.json`;
	write(inventoryPath, JSON.stringify(inventory));
	const manifest = {
		schemaVersion: 1,
		materializedTests: packagePath,
		provenance: {
			repo: 'https://github.com/acme/mit-widget.git',
			version: '1.0.0',
			commit: 'a'.repeat(40),
			sourceRoot: 'src',
			testRoot: 'tests',
			license: 'MIT',
			integrity: `sha256:${'0'.repeat(64)}`,
			verification: 'recorded-unverified',
		},
		upstreamSuites: { runtime: 'present', types: 'absent' },
		adaptedRoots: {
			source: { roots: [`${packagePath}/src`], include: ['\\.ts$'], exclude: [] },
			tests: { roots: [`${packagePath}/tests/upstream`], include: ['\\.test\\.ts$'], exclude: [] },
		},
		adaptedRuntimeSummary: summarizeRuntimeInventories([inventory]),
		environments: {
			local: {
				node: '>=22',
				platform: 'any',
				arch: 'any',
				packageManager: 'pnpm@11.15.1',
				lockfile: 'pnpm-lock.yaml',
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
				evidenceOrigin: 'upstream-suite',
				execution: { kind: 'vitest-full', inventory: inventoryPath },
				files: [
					{ path: inventoryPath, role: 'support', sha256: sha256(JSON.stringify(inventory)) },
				],
			},
		],
		divergences: [
			{
				id: 'native-events',
				caseIds: ['runtime:example'],
				upstreamResult: 'Synthetic event',
				octaneResult: 'Native event',
				rationale: 'Framework event model',
				classification: 'event-model',
				consumerImpact: 'Use native event fields',
				migrationGuidance: 'Use native input handlers',
				owner: 'example',
				reviewCondition: 'Event contract changes',
			},
		],
	};
	return { root, write, source, adapted, manifest };
}

test('accepts minimal divergence annotations after verifying the exact adapted patch bytes', async (t) => {
	const { root, manifest } = fixture(t);
	assert.deepEqual(
		[...verifyMaterializedAdaptedEvidence(root, packagePath, manifest.provenance)],
		[adaptedPath],
	);
	await assert.doesNotReject(() => verifyManifestFiles(validateManifest(manifest), root));
});

test('does not accept short annotations without materialized provenance', async (t) => {
	const { root, manifest } = fixture(t);
	delete manifest.materializedTests;
	await assert.rejects(
		() => verifyManifestFiles(validateManifest(manifest), root),
		/must bind a declared case/,
	);
});

test('rejects a changed adapted assertion even when its annotation is declared', async (t) => {
	const { root, write, adapted, manifest } = fixture(t);
	write(adaptedPath, adapted.replace("check('native')", "check('wrong')"));
	await assert.rejects(
		() => verifyManifestFiles(validateManifest(manifest), root),
		/Adapted tree drifted/,
	);
});

test('rejects changed pristine bytes before trusting an adapted annotation', async (t) => {
	const { root, write, source, manifest } = fixture(t);
	write(pristinePath, source.replace('upstream', 'changed'));
	await assert.rejects(
		() => verifyManifestFiles(validateManifest(manifest), root),
		/upstream tree drifted/,
	);
});

test('rejects byte-identical adapted symlinks that change relative dependency resolution', async (t) => {
	const { root, write, adapted, manifest } = fixture(t);
	write('elsewhere/example.test.ts', adapted);
	rmSync(join(root, adaptedPath));
	symlinkSync(join(root, 'elsewhere/example.test.ts'), join(root, adaptedPath));
	assert.throws(
		() => verifyMaterializedAdaptedEvidence(root, packagePath, manifest.provenance),
		/Adapted evidence must not use symlinks/,
	);
});

test('rejects a declared package whose version differs from the manifest', async (t) => {
	const { root, manifest } = fixture(t);
	manifest.provenance.version = '2.0.0';
	await assert.rejects(() => verifyManifestFiles(validateManifest(manifest), root), /pin differs/);
});

test('still requires every materialized annotation to name a declared divergence', async (t) => {
	const { root, manifest } = fixture(t, 'undeclared');
	await assert.rejects(
		() => verifyManifestFiles(validateManifest(manifest), root),
		/undeclared divergence marker/,
	);
});

test('does not extend materialized annotation permission to authored source', async (t) => {
	const { root, write, manifest } = fixture(t);
	write(`${packagePath}/src/index.ts`, '// OCTANE DIVERGENCE[native-events]: source rationale\n');
	await assert.rejects(
		() => verifyManifestFiles(validateManifest(manifest), root),
		/must bind a declared case/,
	);
});

test('rejects a materialized package path escaping the repository', (t) => {
	const { manifest } = fixture(t);
	manifest.materializedTests = '../example';
	assert.throws(() => validateManifest(manifest), /must name one repository package/);
});

test('requires declared divergence cases even when the adapted bytes are verified', (t) => {
	const { manifest } = fixture(t);
	manifest.divergences[0].caseIds = [];
	assert.throws(() => validateManifest(manifest), /at least one case id/);
});
