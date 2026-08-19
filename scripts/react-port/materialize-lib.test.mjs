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

describe('adapted planning', () => {
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
