import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import {
	FIXTURE_SOURCES,
	fixtureArchive,
	fixtureIdentity,
	fixtureTreeEntries,
} from './__fixtures__/materialize-fixtures.mjs';
import { UPSTREAM_LOCK_RELATIVE_PATH, gitBlobSha1 } from './materialize-lib.mjs';
import { main } from './materialize.mjs';
import { createBatchManifest } from './state-lib.mjs';

const NODE_ID = 'pkg:mit-widget';
const COMMIT = 'a'.repeat(40);
const TREE_SHA = 'b'.repeat(40);

function fixtureFetch({ sources = FIXTURE_SOURCES, blobs = new Map() } = {}) {
	return async (url) => {
		const href = url.toString();
		if (href === `https://api.github.com/repos/acme/mit-widget/commits/${COMMIT}`) {
			return Response.json({ sha: COMMIT, commit: { tree: { sha: TREE_SHA } } });
		}
		if (href === `https://api.github.com/repos/acme/mit-widget/git/trees/${TREE_SHA}?recursive=1`) {
			return Response.json({ sha: TREE_SHA, truncated: false, tree: fixtureTreeEntries(sources) });
		}
		if (href === `https://codeload.github.com/acme/mit-widget/tar.gz/${COMMIT}`) {
			return new Response(fixtureArchive(sources));
		}
		const blobMatch = /git\/blobs\/([0-9a-f]{40})$/.exec(href);
		if (blobMatch && blobs.has(blobMatch[1])) {
			return Response.json({
				encoding: 'base64',
				content: Buffer.from(blobs.get(blobMatch[1])).toString('base64'),
			});
		}
		return new Response('not found', { status: 404 });
	};
}

function writeBatchManifest(workRoot, batchId) {
	const manifest = createBatchManifest({
		batchId,
		inventoryFingerprint: 'inventory-fixture',
		nodes: {
			[NODE_ID]: {
				state: 'ready',
				dependsOn: [],
				identity: fixtureIdentity(),
				license: {
					source: {
						status: 'passed',
						spdx: 'MIT',
						evidence: [{ path: 'LICENSE', scope: 'package', sha256: '0'.repeat(64) }],
						notices: [],
					},
				},
			},
		},
	});
	const batchDirectory = path.join(workRoot, batchId);
	mkdirSync(batchDirectory, { recursive: true });
	writeFileSync(path.join(batchDirectory, 'manifest.json'), JSON.stringify(manifest));
}

async function runCli(argumentsList, { fetchImpl } = {}) {
	const stdout = [];
	const stderr = [];
	const originalStdout = process.stdout.write;
	const originalStderr = process.stderr.write;
	const originalExitCode = process.exitCode;
	process.exitCode = undefined;
	process.stdout.write = (chunk) => {
		stdout.push(String(chunk));
		return true;
	};
	process.stderr.write = (chunk) => {
		stderr.push(String(chunk));
		return true;
	};
	try {
		await main({
			argumentsList,
			fetchImpl: fetchImpl ?? fixtureFetch(),
			env: {},
		});
		return { exitCode: process.exitCode ?? 0, stdout: stdout.join(''), stderr: stderr.join('') };
	} finally {
		process.stdout.write = originalStdout;
		process.stderr.write = originalStderr;
		process.exitCode = originalExitCode;
	}
}

function scenario() {
	const root = mkdtempSync(path.join(tmpdir(), 'materialize-cli-'));
	// The tracked-file guard and patch application both run through git, so the
	// scenario package lives in its own throwaway repository.
	execFileSync('git', ['-C', root, 'init', '--quiet']);
	const packageDirectory = path.join(root, 'packages', 'mit-widget');
	mkdirSync(packageDirectory, { recursive: true });
	const workRoot = path.join(root, '.react-port-work');
	writeBatchManifest(workRoot, 'fixture-batch');
	return { root, packageDirectory, workRoot };
}

const LOCK_ARGUMENTS = (context) => [
	'lock',
	'--batch',
	'fixture-batch',
	'--node',
	NODE_ID,
	'--package-dir',
	context.packageDirectory,
	'--work-root',
	context.workRoot,
	'--adapted-map',
	'tests=tests/upstream',
];

describe('materialize CLI lifecycle', () => {
	test('lock, run, diff, and check complete an offline round trip', async () => {
		const context = scenario();
		const locked = await runCli(LOCK_ARGUMENTS(context));
		assert.equal(locked.exitCode, 0, locked.stderr);
		const lockPath = path.join(context.packageDirectory, UPSTREAM_LOCK_RELATIVE_PATH);
		const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
		assert.equal(lock.files.length, 3);
		assert.equal(lock.license.spdx, 'MIT');

		const ran = await runCli(['run', '--package-dir', context.packageDirectory]);
		assert.equal(ran.exitCode, 0, ran.stderr);
		const report = JSON.parse(ran.stdout);
		assert.equal(report.pristineFileCount, 3);
		assert.equal(report.blobFallbackCount, 0);
		const pristineTest = path.join(context.packageDirectory, 'upstream', 'tests', 'index.test.js');
		const adaptedTest = path.join(context.packageDirectory, 'tests', 'upstream', 'index.test.js');
		assert.equal(readFileSync(pristineTest, 'utf8'), FIXTURE_SOURCES.get('tests/index.test.js'));
		assert.equal(readFileSync(adaptedTest, 'utf8'), FIXTURE_SOURCES.get('tests/index.test.js'));

		const adapted = readFileSync(adaptedTest, 'utf8').replace("'widget'", "'octane widget'");
		writeFileSync(adaptedTest, adapted);
		const diffed = await runCli(['diff', '--package-dir', context.packageDirectory]);
		assert.equal(diffed.exitCode, 0, diffed.stderr);
		const patchPath = path.join(
			context.packageDirectory,
			'audit',
			'upstream-patches',
			'tests',
			'upstream',
			'index.test.js.patch',
		);
		const patch = readFileSync(patchPath, 'utf8');
		assert.match(patch, /^--- a\/tests\/upstream\/index\.test\.js$/m);
		assert.match(patch, /^\+\+\+ b\/tests\/upstream\/index\.test\.js$/m);
		assert.match(patch, /octane widget/);

		rmSync(path.join(context.packageDirectory, 'tests'), { recursive: true });
		const reran = await runCli(['run', '--package-dir', context.packageDirectory]);
		assert.equal(reran.exitCode, 0, reran.stderr);
		assert.equal(readFileSync(adaptedTest, 'utf8'), adapted);

		const checked = await runCli(['run', '--check', '--package-dir', context.packageDirectory]);
		assert.equal(checked.exitCode, 0, checked.stderr);
		assert.equal(JSON.parse(checked.stdout).status, 'passed');
	});

	test('check fails on pristine drift and run refuses tracked vendored trees', async () => {
		const context = scenario();
		await runCli(LOCK_ARGUMENTS(context));
		await runCli(['run', '--package-dir', context.packageDirectory]);
		writeFileSync(path.join(context.packageDirectory, 'upstream', 'src', 'index.js'), 'tampered\n');
		const checked = await runCli(['run', '--check', '--package-dir', context.packageDirectory]);
		assert.equal(checked.exitCode, 2);
		assert.deepEqual(JSON.parse(checked.stdout).mismatched, ['src/index.js']);

		const tracked = scenario();
		await runCli(LOCK_ARGUMENTS(tracked));
		const legacyPath = path.join(tracked.packageDirectory, 'upstream', 'legacy.txt');
		mkdirSync(path.dirname(legacyPath), { recursive: true });
		writeFileSync(legacyPath, 'legacy vendored bytes\n');
		execFileSync('git', ['-C', tracked.root, 'add', '--force', 'packages/mit-widget/upstream']);
		const refused = await runCli(['run', '--package-dir', tracked.packageDirectory]);
		assert.equal(refused.exitCode, 2);
		assert.match(refused.stderr, /git-tracked files/);
	});

	test('archive drift falls back to content-addressed blobs and forged blobs fail', async () => {
		const context = scenario();
		await runCli(LOCK_ARGUMENTS(context));
		const rewrittenSources = new Map(FIXTURE_SOURCES);
		rewrittenSources.set('src/index.js', 'export const widget = () => 2;\n');
		const pinnedBytes = FIXTURE_SOURCES.get('src/index.js');
		const rewrittenArchiveFetch = fixtureFetch({
			blobs: new Map([[gitBlobSha1(Buffer.from(pinnedBytes)), pinnedBytes]]),
		});
		const originalFetch = rewrittenArchiveFetch;
		const fetchWithRewrittenArchive = async (url) => {
			const href = url.toString();
			if (href.startsWith('https://codeload.github.com/')) {
				return new Response(fixtureArchive(rewrittenSources));
			}
			return originalFetch(url);
		};
		const ran = await runCli(['run', '--package-dir', context.packageDirectory], {
			fetchImpl: fetchWithRewrittenArchive,
		});
		assert.equal(ran.exitCode, 0, ran.stderr);
		assert.equal(JSON.parse(ran.stdout).blobFallbackCount, 1);
		assert.equal(
			readFileSync(path.join(context.packageDirectory, 'upstream', 'src', 'index.js'), 'utf8'),
			pinnedBytes,
		);

		const forged = scenario();
		await runCli(LOCK_ARGUMENTS(forged));
		const forgedFetch = async (url) => {
			const href = url.toString();
			if (href.startsWith('https://codeload.github.com/')) {
				return new Response(fixtureArchive(rewrittenSources));
			}
			if (href.includes('/git/blobs/')) {
				return Response.json({
					encoding: 'base64',
					content: Buffer.from('forged bytes\n').toString('base64'),
				});
			}
			return fixtureFetch()(url);
		};
		const refused = await runCli(['run', '--package-dir', forged.packageDirectory], {
			fetchImpl: forgedFetch,
		});
		assert.equal(refused.exitCode, 2);
		assert.match(refused.stderr, /do not match the pinned lock/);
	});

	test('skip markers exclude a pinned case from the adapted tree but never silently', async () => {
		const context = scenario();
		await runCli(LOCK_ARGUMENTS(context));
		const skipPath = path.join(
			context.packageDirectory,
			'audit',
			'upstream-patches',
			'tests',
			'upstream',
			'index.test.js.skip',
		);
		mkdirSync(path.dirname(skipPath), { recursive: true });
		writeFileSync(skipPath, 'Covered by the pristine lane only; exercises React strict mode.\n');
		const ran = await runCli(['run', '--package-dir', context.packageDirectory]);
		assert.equal(ran.exitCode, 0, ran.stderr);
		const report = JSON.parse(ran.stdout);
		assert.deepEqual(report.adaptedSkipped, ['tests/upstream/index.test.js']);
		assert.equal(
			existsSync(path.join(context.packageDirectory, 'tests', 'upstream', 'index.test.js')),
			false,
		);
		const diffed = await runCli(['diff', '--package-dir', context.packageDirectory]);
		assert.equal(diffed.exitCode, 0, diffed.stderr);
		assert.deepEqual(JSON.parse(diffed.stdout).skipped, ['tests/upstream/index.test.js']);

		rmSync(skipPath);
		const failed = await runCli(['diff', '--package-dir', context.packageDirectory]);
		assert.equal(failed.exitCode, 2);
		assert.match(failed.stderr, /Adapted file is missing for pinned upstream case/);
	});

	test('lock refuses nodes without approved source-license evidence', async () => {
		const context = scenario();
		const manifestPath = path.join(context.workRoot, 'fixture-batch', 'manifest.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		manifest.nodes[NODE_ID].license.source.status = 'blocked';
		writeFileSync(manifestPath, JSON.stringify(manifest));
		const locked = await runCli(LOCK_ARGUMENTS(context));
		assert.equal(locked.exitCode, 2);
		assert.match(locked.stderr, /no approved source license/);
	});
});
