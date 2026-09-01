import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import {
	auditShippedClosure,
	assertCurrentEvidenceMatrix,
	createEvidenceMatrix,
	EVIDENCE_MATRIX_SCHEMA_VERSION,
	evaluateVerificationReadiness,
	inspectBindingPackage,
	recordEvidence,
	validateUpstreamCrosswalk,
} from './evidence-lib.mjs';

const MIT_TEXT = `MIT License

Copyright (c) Fixture Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

function sha256(content) {
	return createHash('sha256').update(content).digest('hex');
}

const CLEAN_ROOM_GRAPH_NODES = {
	'pkg:widget': { packageName: 'widget', dependsOn: ['pkg:react-helper'] },
	'pkg:react-helper': {
		packageName: 'react-helper',
		dependsOn: [],
		action: 'reimplement-in-parent',
		copyPermission: 'denied-or-unproven',
		reimplementation: { copySource: false, copyTests: false },
	},
};

function cleanRoomProof(localEvidence) {
	return {
		packageName: 'react-helper',
		publicBehaviors: ['Formats the parent-visible label'],
		localEvidence,
	};
}

describe('evidence matrix', () => {
	test('derives mandatory gates from the binding category', () => {
		const matrix = createEvidenceMatrix({
			categories: ['hooks-store', 'ssr-sensitive'],
			preflightArtifact: '.react-port-work/fixture/manifest.json',
		});

		for (const gate of [
			'identity-license',
			'package-tests',
			'upstream-types-pristine',
			'upstream-types-adapted',
			'authored-source-types',
			'public-types',
			'packed-source-types-node',
			'packed-source-types-browser',
			'identity-lifecycle',
			'ssr-hydration',
			'upstream-crosswalk',
			'closure-audit',
		]) {
			assert.ok(matrix.gates[gate], gate);
		}
		assert.equal(matrix.schemaVersion, EVIDENCE_MATRIX_SCHEMA_VERSION);
		assert.equal(matrix.gates['upstream-types'], undefined);
		assert.equal(matrix.gates.typecheck, undefined);
		assert.equal(matrix.gates['identity-license'].status, 'passed');
	});

	test('does not accept evidence-free passes or unexplained inapplicability', () => {
		const matrix = createEvidenceMatrix({
			categories: ['thin-core'],
			preflightArtifact: 'manifest.json',
		});
		assert.throws(
			() => recordEvidence(matrix, 'package-tests', { status: 'passed' }),
			/command|artifact/i,
		);
		assert.throws(
			() => recordEvidence(matrix, 'generated-data', { status: 'inapplicable' }),
			/reason/i,
		);
		recordEvidence(matrix, 'package-tests', {
			status: 'passed',
			command: 'pnpm --dir packages/widget test',
			observed: '12 tests passed',
		});
		assert.equal(matrix.gates['package-tests'].status, 'passed');
	});

	test('rejects stale matrices instead of accepting legacy typecheck evidence', () => {
		const staleMatrix = {
			schemaVersion: 1,
			categories: ['thin-core'],
			gates: {
				typecheck: {
					id: 'typecheck',
					label: 'Legacy typecheck',
					status: 'passed',
					allowInapplicable: false,
					artifact: 'legacy-types.log',
					observed: 'Legacy typecheck passed.',
				},
			},
		};

		assert.throws(() => assertCurrentEvidenceMatrix(staleMatrix), /rerun init/i);
		assert.throws(
			() =>
				recordEvidence(staleMatrix, 'typecheck', {
					status: 'failed',
					artifact: 'new-types.log',
					observed: 'New typecheck failed.',
				}),
			/rerun init/i,
		);
		assert.throws(
			() =>
				evaluateVerificationReadiness({
					matrix: staleMatrix,
					crosswalkReport: { status: 'passed' },
					packageReport: { status: 'passed' },
					closureReport: { status: 'passed' },
				}),
			/rerun init/i,
		);
	});

	test('keeps every upstream registration visible with local evidence or a rationale', () => {
		const registrations = [
			{ id: 'renders', source: 'upstream/widget.test.ts:10' },
			{ id: 'legacy-mode', source: 'upstream/widget.test.ts:30' },
		];
		assert.throws(
			() =>
				validateUpstreamCrosswalk(registrations, [
					{ id: 'renders', classification: 'implemented', localEvidence: 'tests/widget.test.ts' },
				]),
			/missing.*legacy-mode/i,
		);
		const result = validateUpstreamCrosswalk(registrations, [
			{ id: 'renders', classification: 'implemented', localEvidence: 'tests/widget.test.ts' },
			{ id: 'legacy-mode', classification: 'inapplicable', rationale: 'Legacy React root only.' },
		]);
		assert.equal(result.status, 'passed');
		assert.equal(result.cases.length, 2);
	});

	test('binds registrations to the immutable upstream test inventory', () => {
		assert.throws(
			() =>
				validateUpstreamCrosswalk(
					[{ id: 'invented', source: 'packages/widget/tests/widget.test.ts:1:1' }],
					[
						{
							id: 'invented',
							classification: 'inapplicable',
							rationale: 'Invented by the caller.',
						},
					],
					[
						{
							path: 'packages/widget/tests/widget.test.ts',
							kind: 'runtime',
							gitBlob: 'a'.repeat(40),
							size: 128,
							registrations: [
								{
									id: 'immutable-renders',
									declarationId: 'react-case-v1:0123456789abcdefabcd',
									source: 'packages/widget/tests/widget.test.ts:4:2',
									kind: 'test',
									title: 'renders',
									estimatedRegistrations: 1,
									registrationIndex: 0,
									dynamicExpansion: null,
									helperExpansion: null,
									manualReviewReason: null,
								},
							],
						},
					],
				),
			/registrations differ.*immutable/i,
		);
	});

	test('rejects immutable upstream test files without counted registrations', () => {
		assert.throws(
			() =>
				validateUpstreamCrosswalk(
					[],
					[],
					[
						{
							path: 'packages/widget/tests/widget.test.ts',
							kind: 'runtime',
							gitBlob: 'a'.repeat(40),
							size: 128,
							registrations: [],
						},
					],
				),
			/no counted registrations/i,
		);
	});

	test('hashes package-local crosswalk evidence and rejects missing files', async () => {
		const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'react-port-crosswalk-evidence-'));
		await mkdir(path.join(evidenceRoot, 'tests'));
		const evidencePath = 'tests/widget.test.tsrx';
		const evidenceContents = 'export const covered = true;\n';
		await writeFile(path.join(evidenceRoot, evidencePath), evidenceContents);
		await writeFile(path.join(evidenceRoot, 'package.json'), '{}\n');
		const registrations = [{ id: 'renders', source: 'upstream/widget.test.ts:10' }];
		const valid = validateUpstreamCrosswalk(
			registrations,
			[{ id: 'renders', classification: 'implemented', localEvidence: evidencePath }],
			[],
			evidenceRoot,
		);

		assert.deepEqual(valid.localEvidenceArtifacts, [
			{ path: evidencePath, sha256: sha256(evidenceContents) },
		]);
		assert.throws(
			() =>
				validateUpstreamCrosswalk(
					registrations,
					[
						{
							id: 'renders',
							classification: 'implemented',
							localEvidence: 'tests/missing.test.ts',
						},
					],
					[],
					evidenceRoot,
				),
			/missing\.test\.ts/i,
		);
		assert.throws(
			() =>
				validateUpstreamCrosswalk(
					registrations,
					[
						{
							id: 'renders',
							classification: 'implemented',
							localEvidence: 'package.json',
						},
					],
					[],
					evidenceRoot,
				),
			/test evidence path/i,
		);
	});
});

describe('package and closure completion', () => {
	test('validates durable package shape, provenance, MIT text, and Octane singleton edges', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'react-port-package-'));
		const packageDirectory = path.join(root, 'packages/widget');
		await mkdir(path.join(packageDirectory, 'src'), { recursive: true });
		await mkdir(path.join(packageDirectory, 'tests'));
		await writeFile(
			path.join(packageDirectory, 'package.json'),
			JSON.stringify({
				name: '@octanejs/widget',
				version: '0.1.0',
				license: 'MIT',
				engines: { node: '>=22.22.2' },
				publishConfig: { access: 'public' },
				repository: { directory: 'packages/widget' },
				files: ['src', 'README.md', 'UPSTREAM.md', 'LICENSE', 'NOTICE'],
				exports: { '.': './src/index.ts' },
				scripts: { test: 'vitest run' },
				dependencies: { 'widget-core': '^1.0.0' },
				peerDependencies: { octane: 'workspace:^0.1.51 || ^0.2.0' },
				devDependencies: { octane: 'workspace:*' },
			}),
		);
		await writeFile(path.join(packageDirectory, 'src/index.ts'), 'export const widget = true;\n');
		await writeFile(path.join(packageDirectory, 'tests/widget.test.ts'), 'export {};\n');
		await writeFile(path.join(packageDirectory, 'README.md'), '# Widget\n');
		await writeFile(path.join(packageDirectory, 'LICENSE'), MIT_TEXT);
		await writeFile(path.join(packageDirectory, 'NOTICE'), 'Fixture attribution\n');
		await writeFile(
			path.join(packageDirectory, 'UPSTREAM.md'),
			'# Upstream\n\nwidget@1.0.0\n\ncommit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n\n## Source boundary\n\nAdapted src/index.ts.\n',
		);
		await writeFile(
			path.join(packageDirectory, 'status.json'),
			JSON.stringify({
				upstream: { package: 'widget', version: '1.0.0' },
				surface: 'Complete public surface.',
				verified: '2026-08-11',
			}),
		);

		const result = inspectBindingPackage(packageDirectory, {
			expectedPackageName: '@octanejs/widget',
			expectedDirectory: 'packages/widget',
			identity: { packageName: 'widget', version: '1.0.0', commit: 'a'.repeat(40) },
			expectedLicenseHashes: [sha256(MIT_TEXT)],
			expectedNoticeHashes: [sha256('Fixture attribution\n')],
		});
		assert.equal(result.status, 'passed', result.issues.join('\n'));
		await unlink(path.join(packageDirectory, 'tests/widget.test.ts'));
		await writeFile(
			path.join(packageDirectory, 'src/widget.spec.ts'),
			"test('renders', () => {});\n",
		);
		const specOnly = inspectBindingPackage(packageDirectory, {
			expectedPackageName: '@octanejs/widget',
			expectedDirectory: 'packages/widget',
			identity: { packageName: 'widget', version: '1.0.0', commit: 'a'.repeat(40) },
			expectedLicenseHashes: [sha256(MIT_TEXT)],
			expectedNoticeHashes: [sha256('Fixture attribution\n')],
		});
		assert.equal(specOnly.status, 'passed', specOnly.issues.join('\n'));
		const wrongName = inspectBindingPackage(packageDirectory, {
			expectedPackageName: '@octanejs/other',
			expectedDirectory: 'packages/widget',
			identity: { packageName: 'widget', version: '1.0.0', commit: 'a'.repeat(40) },
			expectedLicenseHashes: [sha256(MIT_TEXT)],
			expectedNoticeHashes: [sha256('Fixture attribution\n')],
		});
		assert.match(wrongName.issues.join('\n'), /package name must be @octanejs\/other/i);
		const manifestPath = path.join(packageDirectory, 'package.json');
		const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
		manifest.engines.node = '>=22';
		await writeFile(manifestPath, JSON.stringify(manifest));
		const staleNodeEngine = inspectBindingPackage(packageDirectory, {
			expectedPackageName: '@octanejs/widget',
			expectedDirectory: 'packages/widget',
			identity: { packageName: 'widget', version: '1.0.0', commit: 'a'.repeat(40) },
			expectedLicenseHashes: [sha256(MIT_TEXT)],
			expectedNoticeHashes: [sha256('Fixture attribution\n')],
		});
		assert.match(staleNodeEngine.issues.join('\n'), /engines\.node must be >=22\.22\.2/i);
		manifest.engines.node = '>=22.22.2';
		manifest.peerDependencies.react = '^19.0.0';
		await writeFile(manifestPath, JSON.stringify(manifest));
		const reactRuntime = inspectBindingPackage(packageDirectory, {
			expectedPackageName: '@octanejs/widget',
			expectedDirectory: 'packages/widget',
			identity: { packageName: 'widget', version: '1.0.0', commit: 'a'.repeat(40) },
			expectedLicenseHashes: [sha256(MIT_TEXT)],
			expectedNoticeHashes: [sha256('Fixture attribution\n')],
		});
		assert.match(reactRuntime.issues.join('\n'), /react.*must not be a runtime dependency/i);
		delete manifest.peerDependencies.react;
		manifest.engines.node = '>=22.22.2';
		manifest.files = manifest.files.filter((file) => file !== 'NOTICE');
		await writeFile(manifestPath, JSON.stringify(manifest));
		const noticeOmitted = inspectBindingPackage(packageDirectory, {
			expectedDirectory: 'packages/widget',
			identity: { packageName: 'widget', version: '1.0.0', commit: 'a'.repeat(40) },
			expectedLicenseHashes: [sha256(MIT_TEXT)],
			expectedNoticeHashes: [sha256('Fixture attribution\n')],
		});
		assert.match(noticeOmitted.issues.join('\n'), /package files must include NOTICE/);
		manifest.files.push('NOTICE');
		await writeFile(manifestPath, JSON.stringify(manifest));
		await writeFile(path.join(packageDirectory, 'NOTICE'), 'Incomplete attribution\n');
		const changedNotice = inspectBindingPackage(packageDirectory, {
			expectedDirectory: 'packages/widget',
			identity: { packageName: 'widget', version: '1.0.0', commit: 'a'.repeat(40) },
			expectedLicenseHashes: [sha256(MIT_TEXT)],
			expectedNoticeHashes: [sha256('Fixture attribution\n')],
		});
		assert.match(changedNotice.issues.join('\n'), /NOTICE.*exact upstream bytes/i);
		await writeFile(path.join(packageDirectory, 'NOTICE'), 'Fixture attribution\n');

		await writeFile(path.join(root, 'outside.ts'), 'export const escaped = true;\n');
		await unlink(path.join(packageDirectory, 'src/index.ts'));
		await symlink(path.join(root, 'outside.ts'), path.join(packageDirectory, 'src/index.ts'));
		const escaped = inspectBindingPackage(packageDirectory, {
			expectedDirectory: 'packages/widget',
			identity: { packageName: 'widget', version: '1.0.0', commit: 'a'.repeat(40) },
			expectedLicenseHashes: [sha256(MIT_TEXT)],
			expectedNoticeHashes: [sha256('Fixture attribution\n')],
		});
		assert.equal(escaped.status, 'blocked');
		assert.match(escaped.issues.join('\n'), /export target.*escapes/i);
	});

	test('blocks unplanned runtime imports and adapted sources without approved-license evidence', () => {
		const graphNodes = {
			'pkg:widget': {
				packageName: 'widget',
				dependsOn: ['pkg:widget-core'],
				license: {
					policy: 'approved-license-v2',
					published: { status: 'passed', spdx: 'MIT' },
					source: { status: 'passed', spdx: 'MIT' },
				},
			},
			'pkg:widget-core': { packageName: 'widget-core', dependsOn: [], action: 'reuse-package' },
			'pkg:copied-helper': { packageName: 'copied-helper', dependsOn: [] },
		};
		const result = auditShippedClosure({
			nodeId: 'pkg:widget',
			graphNodes,
			runtimeDependencies: ['widget-core', 'surprise-runtime', 'react'],
			adaptedSources: [{ packageName: 'copied-helper', paths: ['src/helper.ts'] }],
		});

		assert.equal(result.status, 'blocked');
		assert.match(result.issues.join('\n'), /surprise-runtime/);
		assert.match(result.issues.join('\n'), /react.*runtime boundary.*test-only/i);
		assert.match(result.issues.join('\n'), /copied-helper.*approved-license/i);
	});

	test('derives runtime imports from reachable shipped source instead of trusting closure input', async () => {
		const packageDirectory = await mkdtemp(path.join(tmpdir(), 'react-port-derived-closure-'));
		await mkdir(path.join(packageDirectory, 'src'));
		await writeFile(
			path.join(packageDirectory, 'package.json'),
			JSON.stringify({
				name: '@octanejs/widget',
				exports: { '.': './src/index.ts' },
			}),
		);
		await writeFile(
			path.join(packageDirectory, 'src/index.ts'),
			"import 'surprise-runtime';\nexport const widget = true;\n",
		);

		const result = auditShippedClosure({
			nodeId: 'pkg:widget',
			graphNodes: {
				'pkg:widget': { packageName: 'widget', dependsOn: [] },
			},
			packageDirectory,
			runtimeDependencies: [],
			adaptedSources: [],
		});

		assert.equal(result.status, 'blocked');
		assert.match(result.issues.join('\n'), /surprise-runtime.*approved graph/i);
	});

	test('does not classify TypeScript type-only imports as shipped runtime dependencies', async () => {
		const packageDirectory = await mkdtemp(path.join(tmpdir(), 'react-port-type-only-closure-'));
		await mkdir(path.join(packageDirectory, 'src'));
		await writeFile(
			path.join(packageDirectory, 'package.json'),
			JSON.stringify({
				name: '@octanejs/widget',
				exports: { '.': './src/index.ts' },
			}),
		);
		const source =
			"import type { Helper } from 'types-only-helper';\nexport type Widget = Helper;\n";
		await writeFile(path.join(packageDirectory, 'src/index.ts'), source);

		const result = auditShippedClosure({
			nodeId: 'pkg:widget',
			graphNodes: {
				'pkg:widget': { packageName: 'widget', dependsOn: [] },
			},
			packageDirectory,
			runtimeDependencies: [],
			adaptedSources: [],
			sourceLedger: [{ path: 'src/index.ts', origin: 'authored', sha256: sha256(source) }],
		});

		assert.equal(result.status, 'passed', result.issues.join('\n'));
	});

	test('requires React-coupled dependency edges to use their planned binding', () => {
		const result = auditShippedClosure({
			nodeId: 'pkg:widget',
			graphNodes: {
				'pkg:widget': { packageName: 'widget', dependsOn: ['pkg:react-helper'] },
				'pkg:react-helper': {
					packageName: 'react-helper',
					binding: '@octanejs/helper',
					action: 'reuse-binding',
					dependsOn: [],
				},
			},
			runtimeDependencies: ['react-helper'],
			adaptedSources: [],
		});

		assert.equal(result.status, 'blocked');
		assert.match(result.issues.join('\n'), /react-helper.*approved graph/i);
	});

	test('does not require an evidence root without clean-room obligations', () => {
		const result = auditShippedClosure({
			nodeId: 'pkg:widget',
			graphNodes: {
				'pkg:widget': { packageName: 'widget', dependsOn: [] },
			},
			runtimeDependencies: ['octane'],
			adaptedSources: [],
		});

		assert.equal(result.status, 'passed', result.issues.join('\n'));
		assert.equal('localEvidenceArtifacts' in result, false);
	});

	test('requires independently authored proof for every direct clean-room dependency', async () => {
		const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'react-port-clean-room-proof-'));
		await mkdir(path.join(evidenceRoot, 'tests'));
		await writeFile(
			path.join(evidenceRoot, 'tests/react-helper-differential.test.tsrx'),
			'export const independentlyAuthored = true;\n',
		);
		const graphNodes = CLEAN_ROOM_GRAPH_NODES;
		const missing = auditShippedClosure({
			nodeId: 'pkg:widget',
			graphNodes,
			runtimeDependencies: [],
			adaptedSources: [],
			reimplementedDependencies: [],
		});

		assert.equal(missing.status, 'blocked');
		assert.match(missing.issues.join('\n'), /react-helper.*clean-room.*proof/i);

		const proof = {
			packageName: 'react-helper',
			publicBehaviors: ['Formats the parent-visible label', 'Preserves empty input'],
			localEvidence: ['tests/react-helper-differential.test.tsrx'],
		};
		const valid = auditShippedClosure({
			nodeId: 'pkg:widget',
			graphNodes,
			evidenceRoot,
			runtimeDependencies: [],
			adaptedSources: [],
			reimplementedDependencies: [proof],
		});
		const reordered = auditShippedClosure({
			nodeId: 'pkg:widget',
			graphNodes,
			evidenceRoot,
			runtimeDependencies: [],
			adaptedSources: [],
			reimplementedDependencies: [
				{
					...proof,
					publicBehaviors: [...proof.publicBehaviors].reverse(),
				},
			],
		});

		assert.equal(valid.status, 'passed', valid.issues.join('\n'));
		assert.equal(reordered.fingerprint, valid.fingerprint);
	});

	test('blocks a planned clean-room package retained as a runtime dependency', async () => {
		const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'react-port-clean-room-runtime-'));
		await mkdir(path.join(evidenceRoot, 'tests'));
		await writeFile(
			path.join(evidenceRoot, 'tests/react-helper.test.ts'),
			'export const independentlyAuthored = true;\n',
		);
		const graphNodes = CLEAN_ROOM_GRAPH_NODES;

		const result = auditShippedClosure({
			nodeId: 'pkg:widget',
			graphNodes,
			evidenceRoot,
			runtimeDependencies: ['react-helper'],
			adaptedSources: [],
			reimplementedDependencies: [cleanRoomProof(['tests/react-helper.test.ts'])],
		});

		assert.equal(result.status, 'blocked');
		assert.match(result.issues.join('\n'), /react-helper.*clean-room.*runtime dependency/i);
	});

	test('binds package-local clean-room evidence file bytes into the closure report', async () => {
		const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'react-port-clean-room-evidence-'));
		const evidencePath = 'tests/react-helper.test.ts';
		const firstContents = "export const independentlyAuthored = 'first';\n";
		await mkdir(path.join(evidenceRoot, 'tests'));
		await writeFile(path.join(evidenceRoot, evidencePath), firstContents);
		const graphNodes = CLEAN_ROOM_GRAPH_NODES;
		const proof = cleanRoomProof([evidencePath]);

		const first = auditShippedClosure({
			nodeId: 'pkg:widget',
			graphNodes,
			evidenceRoot,
			runtimeDependencies: [],
			adaptedSources: [],
			reimplementedDependencies: [proof],
		});
		await writeFile(
			path.join(evidenceRoot, evidencePath),
			"export const independentlyAuthored = 'second';\n",
		);
		const second = auditShippedClosure({
			nodeId: 'pkg:widget',
			graphNodes,
			evidenceRoot,
			runtimeDependencies: [],
			adaptedSources: [],
			reimplementedDependencies: [proof],
		});

		assert.equal(first.status, 'passed', first.issues.join('\n'));
		assert.deepEqual(first.localEvidenceArtifacts, [
			{ path: evidencePath, sha256: sha256(firstContents) },
		]);
		assert.notEqual(second.fingerprint, first.fingerprint);
	});

	test('blocks a missing clean-room evidence path', async () => {
		const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'react-port-missing-evidence-'));
		const graphNodes = CLEAN_ROOM_GRAPH_NODES;

		const result = auditShippedClosure({
			nodeId: 'pkg:widget',
			graphNodes,
			evidenceRoot,
			runtimeDependencies: [],
			adaptedSources: [],
			reimplementedDependencies: [cleanRoomProof(['tests/missing.test.ts'])],
		});

		assert.equal(result.status, 'blocked');
		assert.match(result.issues.join('\n'), /tests\/missing\.test\.ts.*missing/i);
	});

	test('blocks a directory used as clean-room evidence', async () => {
		const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'react-port-directory-evidence-'));
		await mkdir(path.join(evidenceRoot, 'tests'));
		const graphNodes = CLEAN_ROOM_GRAPH_NODES;

		const result = auditShippedClosure({
			nodeId: 'pkg:widget',
			graphNodes,
			evidenceRoot,
			runtimeDependencies: [],
			adaptedSources: [],
			reimplementedDependencies: [cleanRoomProof(['tests'])],
		});

		assert.equal(result.status, 'blocked');
		assert.match(result.issues.join('\n'), /tests.*regular file/i);
	});

	test('blocks a clean-room evidence symlink that escapes the package root', async () => {
		const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'react-port-symlink-evidence-'));
		const evidenceRoot = path.join(fixtureRoot, 'package');
		const outsidePath = path.join(fixtureRoot, 'outside.test.ts');
		await mkdir(path.join(evidenceRoot, 'tests'), { recursive: true });
		await writeFile(outsidePath, 'export const upstreamDerived = true;\n');
		await symlink(outsidePath, path.join(evidenceRoot, 'tests/escaped.test.ts'));
		const graphNodes = CLEAN_ROOM_GRAPH_NODES;

		const result = auditShippedClosure({
			nodeId: 'pkg:widget',
			graphNodes,
			evidenceRoot,
			runtimeDependencies: [],
			adaptedSources: [],
			reimplementedDependencies: [cleanRoomProof(['tests/escaped.test.ts'])],
		});

		assert.equal(result.status, 'blocked');
		assert.match(result.issues.join('\n'), /tests\/escaped\.test\.ts.*escapes/i);
	});

	test('blocks copied source and malformed or unplanned clean-room proof', () => {
		const graphNodes = CLEAN_ROOM_GRAPH_NODES;
		const result = auditShippedClosure({
			nodeId: 'pkg:widget',
			graphNodes,
			runtimeDependencies: [],
			adaptedSources: [{ packageName: 'react-helper', paths: ['src/copied-helper.ts'] }],
			reimplementedDependencies: [
				{
					packageName: 'react-helper',
					publicBehaviors: [''],
					localEvidence: ['../upstream/react-helper.test.ts'],
				},
				{
					packageName: 'react-helper',
					publicBehaviors: ['Duplicate proof'],
					localEvidence: ['tests/duplicate.test.ts'],
				},
				{
					packageName: 'surprise-helper',
					publicBehaviors: ['Unplanned behavior'],
					localEvidence: ['tests/surprise.test.ts'],
				},
			],
		});

		assert.equal(result.status, 'blocked');
		assert.match(result.issues.join('\n'), /react-helper.*must not copy or adapt source/i);
		assert.match(result.issues.join('\n'), /react-helper.*exactly one.*proof/i);
		assert.match(result.issues.join('\n'), /public behaviors/i);
		assert.match(result.issues.join('\n'), /unsafe.*\.\.\/upstream/i);
		assert.match(result.issues.join('\n'), /surprise-helper.*not.*planned/i);
	});

	test('cannot report verified while a required gate or completion report is missing', () => {
		const matrix = createEvidenceMatrix({
			categories: ['thin-core'],
			preflightArtifact: 'manifest.json',
		});
		const readiness = evaluateVerificationReadiness({
			matrix,
			crosswalkReport: { status: 'passed', cases: [] },
			packageReport: { status: 'passed', issues: [] },
			closureReport: { status: 'passed', issues: [] },
		});
		assert.equal(readiness.status, 'blocked');
		assert.ok(readiness.issues.some((issue) => issue.includes('package-tests')));
	});
});
