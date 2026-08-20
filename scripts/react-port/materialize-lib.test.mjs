import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import {
	FIXTURE_SOURCES,
	buildTarGz,
	fixtureIdentity,
	fixtureTreeEntries,
} from './__fixtures__/materialize-fixtures.mjs';
import {
	MATERIALIZE_STATE_FILE,
	assertSafeLockPath,
	findForbiddenReactSpecifiers,
	buildUpstreamLock,
	extractPristineFromArchive,
	gitBlobSha1,
	planAdaptedFiles,
	upstreamLockFingerprint,
	validateUpstreamLock,
	verifyPristineTree,
} from './materialize-lib.mjs';

function fixtureLock({ adaptedMappings = [{ fromRoot: 'tests', toRoot: 'tests/upstream' }] } = {}) {
	return buildUpstreamLock({
		identity: fixtureIdentity(),
		license: { spdx: 'MIT', evidence: [{ path: 'LICENSE', sha256: '0'.repeat(64) }], notices: [] },
		treeEntries: fixtureTreeEntries(),
		adaptedMappings,
	});
}

describe('git blob hashing', () => {
	test('matches git hash-object for a known vector', () => {
		assert.equal(gitBlobSha1(Buffer.from('test\n')), '9daeafb9864cf43055ae93beb0afd6c7d144bfa4');
	});

	test('rejects non-buffer input', () => {
		assert.throws(() => gitBlobSha1('test\n'), /Buffer or Uint8Array/);
	});
});

describe('lock paths', () => {
	test('rejects traversal, absolute, and escaped paths', () => {
		for (const value of ['../x', '/etc/passwd', 'a/../b', 'a//b', 'a\\b', '', 'a/./b']) {
			assert.throws(() => assertSafeLockPath(value, 'Test path'), /not a safe relative path/);
		}
		assert.equal(assertSafeLockPath('src/deep/file.ts', 'Test path'), 'src/deep/file.ts');
	});
});

describe('lock construction and validation', () => {
	test('builds a fingerprinted lock scoped to the subdirectory', () => {
		const identity = fixtureIdentity({ repository: { subdirectory: 'packages/widget' } });
		const lock = buildUpstreamLock({
			identity,
			license: { spdx: 'MIT', evidence: [], notices: [] },
			treeEntries: [
				...fixtureTreeEntries(FIXTURE_SOURCES, 'packages/widget/'),
				{
					path: 'packages/other/index.js',
					type: 'blob',
					mode: '100644',
					sha: 'b'.repeat(40),
					size: 5,
				},
				{ path: 'packages/widget/src', type: 'tree', sha: 'c'.repeat(40) },
			],
			adaptedMappings: [{ fromRoot: 'tests', toRoot: 'tests/upstream' }],
		});
		assert.deepEqual(
			lock.files.map((file) => file.path),
			['LICENSE', 'src/index.js', 'tests/index.test.js'],
		);
		assert.equal(lock.fingerprint, upstreamLockFingerprint(lock));
		assert.equal(validateUpstreamLock(structuredClone(lock)).fingerprint, lock.fingerprint);
	});

	test('scopes narrow the pin to a reviewed subset and change the fingerprint', () => {
		const scoped = buildUpstreamLock({
			identity: fixtureIdentity(),
			license: { spdx: 'MIT', evidence: [], notices: [] },
			treeEntries: fixtureTreeEntries(),
			scopes: ['tests'],
			adaptedMappings: [],
		});
		assert.deepEqual(
			scoped.files.map((file) => file.path),
			['tests/index.test.js'],
		);
		const full = buildUpstreamLock({
			identity: fixtureIdentity(),
			license: { spdx: 'MIT', evidence: [], notices: [] },
			treeEntries: fixtureTreeEntries(),
			adaptedMappings: [],
		});
		assert.notEqual(scoped.fingerprint, full.fingerprint);
		// An out-of-scope symlink cannot block a scoped pin; an in-scope one must.
		const link = { path: 'link', type: 'blob', mode: '120000', sha: 'a'.repeat(40), size: 3 };
		assert.equal(
			buildUpstreamLock({
				identity: fixtureIdentity(),
				license: { spdx: 'MIT', evidence: [], notices: [] },
				treeEntries: [...fixtureTreeEntries(), link],
				scopes: ['tests'],
				adaptedMappings: [],
			}).files.length,
			1,
		);
	});

	test('rejects symlinks in the pinned tree', () => {
		assert.throws(
			() =>
				buildUpstreamLock({
					identity: fixtureIdentity(),
					license: { spdx: 'MIT', evidence: [], notices: [] },
					treeEntries: [
						{ path: 'link', type: 'blob', mode: '120000', sha: 'a'.repeat(40), size: 3 },
					],
				}),
			/contains a symlink/,
		);
	});

	test('locks written before optional fields existed keep validating', async () => {
		const { fingerprint } = await import('./report-lib.mjs');
		const lock = structuredClone(fixtureLock());
		delete lock.scopes;
		// A lock from before the scopes field stored a fingerprint over exactly
		// this input shape; an empty or absent optional field must reproduce it.
		const legacyFingerprint = fingerprint({
			schemaVersion: lock.schemaVersion,
			identity: lock.identity,
			license: lock.license,
			adaptedMappings: lock.adaptedMappings,
			adaptedRewrites: lock.adaptedRewrites,
			files: lock.files,
		});
		assert.equal(lock.fingerprint, legacyFingerprint);
		assert.equal(validateUpstreamLock(lock).fingerprint, legacyFingerprint);
	});

	test('rejects a tampered fingerprint and adapted targets outside tests/upstream', () => {
		const lock = fixtureLock();
		const tampered = structuredClone(lock);
		tampered.files[0].gitBlob = 'f'.repeat(40);
		assert.throws(() => validateUpstreamLock(tampered), /fingerprint does not match/);
		assert.throws(
			() => fixtureLock({ adaptedMappings: [{ fromRoot: 'tests', toRoot: 'src' }] }),
			/toRoot must be tests\/upstream/,
		);
	});
});

describe('forbidden React specifiers', () => {
	test('flags every React import form in module code', () => {
		const source = [
			"import { useState } from 'react';",
			'import "react-dom/client";',
			"const rtl = require('@testing-library/react');",
			"const lazy = await import('react/jsx-runtime');",
		].join('\n');
		assert.deepEqual(findForbiddenReactSpecifiers('tests/upstream/x.test.tsx', source), [
			'@testing-library/react',
			'react',
			'react-dom/client',
			'react/jsx-runtime',
		]);
	});

	test('ignores non-React specifiers that merely start with react', () => {
		const source = [
			"import { HexColorPicker } from 'react-colorful';",
			"import octane from 'octane';",
			"import { render } from '@octanejs/testing-library';",
		].join('\n');
		assert.deepEqual(findForbiddenReactSpecifiers('tests/upstream/x.test.ts', source), []);
	});

	test('ignores non-module targets such as snapshots', () => {
		assert.deepEqual(
			findForbiddenReactSpecifiers('tests/upstream/tag/snapshots/x.test.js.snap', "from 'react'"),
			[],
		);
	});
});

describe('adapted planning', () => {
	test('a mapping include regex narrows the planned files', () => {
		const lock = {
			adaptedMappings: [
				{ fromRoot: 'lib', toRoot: 'tests/upstream', include: '\\.test\\.[tj]sx?$' },
			],
			files: [
				{ path: 'lib/Grid.tsx', gitBlob: 'a'.repeat(40) },
				{ path: 'lib/Grid.test.tsx', gitBlob: 'b'.repeat(40) },
				{ path: 'lib/core/get.test.ts', gitBlob: 'c'.repeat(40) },
			],
		};
		assert.deepEqual(
			planAdaptedFiles(lock)
				.map((planned) => planned.targetPath)
				.sort(),
			['tests/upstream/Grid.test.tsx', 'tests/upstream/core/get.test.ts'],
		);
	});

	test('maps pinned test files onto their tests/upstream targets', () => {
		assert.deepEqual(planAdaptedFiles(fixtureLock()), [
			{
				sourcePath: 'tests/index.test.js',
				targetPath: 'tests/upstream/index.test.js',
				gitBlob: gitBlobSha1(Buffer.from(FIXTURE_SOURCES.get('tests/index.test.js'))),
			},
		]);
	});

	test('an empty mapping list plans nothing', () => {
		assert.deepEqual(planAdaptedFiles(fixtureLock({ adaptedMappings: [] })), []);
	});
});

describe('archive extraction', () => {
	test('verifies every pinned blob and reports drift precisely', () => {
		const lock = fixtureLock();
		const prefix = `mit-widget-${'a'.repeat(40)}/`;
		const archive = buildTarGz([
			[`${prefix}`, null],
			...[...FIXTURE_SOURCES.entries()].map(([relativePath, content]) => [
				`${prefix}${relativePath}`,
				content,
			]),
			[`${prefix}extra.txt`, 'not pinned\n'],
		]);
		const extracted = extractPristineFromArchive(lock, archive);
		assert.deepEqual(extracted.unexpected, ['extra.txt']);
		assert.deepEqual(extracted.missing, []);
		assert.deepEqual(extracted.mismatched, []);
		assert.equal(extracted.files.size, 3);
	});

	test('flags rewritten and absent bytes instead of accepting them', () => {
		const lock = fixtureLock();
		const prefix = `mit-widget-${'a'.repeat(40)}/`;
		const archive = buildTarGz([
			[`${prefix}LICENSE`, 'MIT License fixture\n'],
			[`${prefix}src/index.js`, 'export const widget = () => 2;\n'],
		]);
		const extracted = extractPristineFromArchive(lock, archive);
		assert.deepEqual(extracted.mismatched, ['src/index.js']);
		assert.deepEqual(extracted.missing, ['tests/index.test.js']);
		assert.equal(extracted.files.size, 1);
	});

	test('tolerates symlinks outside the pinned scope but rejects them inside it', () => {
		const identity = fixtureIdentity({ repository: { subdirectory: 'packages/widget' } });
		const lock = buildUpstreamLock({
			identity,
			license: { spdx: 'MIT', evidence: [], notices: [] },
			treeEntries: fixtureTreeEntries(FIXTURE_SOURCES, 'packages/widget/'),
			adaptedMappings: [],
		});
		const prefix = `mit-widget-${'a'.repeat(40)}/`;
		const scopedEntries = [...FIXTURE_SOURCES.entries()].map(([relativePath, content]) => [
			`${prefix}packages/widget/${relativePath}`,
			content,
		]);
		const outside = extractPristineFromArchive(
			lock,
			buildTarGz([[`${prefix}docs/link-to-readme`, null, '2'], ...scopedEntries]),
		);
		assert.equal(outside.files.size, 3);
		assert.deepEqual(outside.missing, []);
		assert.throws(
			() =>
				extractPristineFromArchive(
					lock,
					buildTarGz([[`${prefix}packages/widget/link`, null, '2'], ...scopedEntries]),
				),
			/link/,
		);
	});

	test('a scoped pin ignores out-of-scope files and symlinks in the archive', () => {
		const lock = buildUpstreamLock({
			identity: fixtureIdentity(),
			license: { spdx: 'MIT', evidence: [], notices: [] },
			treeEntries: fixtureTreeEntries(),
			scopes: ['tests'],
			adaptedMappings: [],
		});
		assert.deepEqual(
			lock.files.map((file) => file.path),
			['tests/index.test.js'],
		);
		const prefix = `mit-widget-${'a'.repeat(40)}/`;
		const extracted = extractPristineFromArchive(
			lock,
			buildTarGz([
				[`${prefix}docs/link`, null, '2'],
				[`${prefix}src/index.js`, FIXTURE_SOURCES.get('src/index.js')],
				[`${prefix}tests/index.test.js`, FIXTURE_SOURCES.get('tests/index.test.js')],
			]),
		);
		assert.equal(extracted.files.size, 1);
		assert.deepEqual(extracted.missing, []);
		assert.deepEqual(extracted.unexpected, []);
		const withInScopeExtra = extractPristineFromArchive(
			lock,
			buildTarGz([
				[`${prefix}tests/index.test.js`, FIXTURE_SOURCES.get('tests/index.test.js')],
				[`${prefix}tests/extra.test.js`, 'extra\n'],
			]),
		);
		assert.deepEqual(withInScopeExtra.unexpected, ['tests/extra.test.js']);
	});

	test('rejects archives without a single top-level directory', () => {
		const lock = fixtureLock();
		const archive = buildTarGz([
			['one/LICENSE', 'MIT License fixture\n'],
			['two/src/index.js', 'export const widget = () => 1;\n'],
		]);
		assert.throws(() => extractPristineFromArchive(lock, archive), /single top-level directory/);
	});
});

describe('pristine tree verification', () => {
	test('reports missing, mismatched, and unexpected files against the lock', () => {
		const lock = fixtureLock();
		const root = mkdtempSync(path.join(tmpdir(), 'materialize-lib-verify-'));
		writeFileSync(path.join(root, 'LICENSE'), FIXTURE_SOURCES.get('LICENSE'));
		mkdirSync(path.join(root, 'src'), { recursive: true });
		writeFileSync(path.join(root, 'src', 'index.js'), 'tampered\n');
		writeFileSync(path.join(root, 'stray.txt'), 'stray\n');
		writeFileSync(path.join(root, MATERIALIZE_STATE_FILE), '{}\n');
		const verification = verifyPristineTree(lock, root);
		assert.deepEqual(verification.missing, ['tests/index.test.js']);
		assert.deepEqual(verification.mismatched, ['src/index.js']);
		assert.deepEqual(verification.unexpected, ['stray.txt']);
	});
});
