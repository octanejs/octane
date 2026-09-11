import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import ts from 'typescript';
import {
	FIXTURE_SOURCES,
	PIN_FIXTURE_SOURCES,
	fixtureArchive,
	fixtureIdentity,
	fixtureTreeEntries,
} from './__fixtures__/materialize-fixtures.mjs';
import {
	UPSTREAM_LOCK_RELATIVE_PATH,
	buildUpstreamLock,
	gitBlobSha1,
	upstreamLockFingerprint,
} from './materialize-lib.mjs';
import { main } from './materialize.mjs';
import { createBatchManifest } from './state-lib.mjs';
import { ensureMaterializedUpstream } from './ensure-materialized.mjs';
import {
	discoverMaterializedUpstreamPackages,
	verifyMaterializedAdaptedEvidence,
	verifyMaterializedUpstreamEvidence,
} from '../react-parity/materialized-upstream-lib.mjs';

const NODE_ID = 'pkg:mit-widget';
const COMMIT = 'a'.repeat(40);
const TREE_SHA = 'b'.repeat(40);

function fixtureFetch({ sources = FIXTURE_SOURCES, blobs = new Map(), registry = null } = {}) {
	const contentBlobs = new Map(blobs);
	for (const content of sources.values()) {
		contentBlobs.set(gitBlobSha1(Buffer.from(content)), content);
	}
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
		if (registry && href === 'https://registry.npmjs.org/mit-widget/1.0.0') {
			return Response.json(registry);
		}
		const blobMatch = /git\/blobs\/([0-9a-f]{40})$/.exec(href);
		if (blobMatch && contentBlobs.has(blobMatch[1])) {
			return Response.json({
				encoding: 'base64',
				content: Buffer.from(contentBlobs.get(blobMatch[1])).toString('base64'),
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
	test('mixed binding cleanup reduces files while preserving consumer behavior, types, and copied evidence', async (t) => {
		const context = scenario();
		try {
			const write = (file, value) => {
				mkdirSync(path.dirname(path.join(context.packageDirectory, file)), { recursive: true });
				writeFileSync(
					path.join(context.packageDirectory, file),
					typeof value === 'string' ? value : JSON.stringify(value),
				);
			};
			const hash = (value) => createHash('sha256').update(value).digest('hex');
			const engine = `/** @param {number} start @param {number} end @param {number} progress */
export function engine(start, end, progress) {
	return start + (end - start) * Math.max(0, Math.min(1, progress));
}
`;
			const copied = 'export function copied() { return 1; }\n';
			const upstreamTest = (name, assertion) =>
				`import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ${name} } from '../src/${name}.js';
test('${name} behavior', () => { ${assertion} });
`;
			const sources = new Map([
				['LICENSE', 'MIT License fixture\n'],
				['src/engine.js', engine],
				['src/copied.js', copied],
				['tests/engine.test.js', upstreamTest('engine', 'assert.equal(engine(10, 30, 0.25), 15);')],
				['tests/copied.test.js', upstreamTest('copied', 'assert.equal(copied(), 1);')],
			]);
			const makeLock = (scopes = []) =>
				buildUpstreamLock({
					identity: fixtureIdentity(),
					license: {
						spdx: 'MIT',
						evidence: [{ path: 'LICENSE', sha256: hash(sources.get('LICENSE')) }],
					},
					treeEntries: fixtureTreeEntries(sources),
					scopes,
					adaptedMappings: [{ fromRoot: 'tests', toRoot: 'tests/upstream' }],
					adaptedRewrites: [{ find: '../src/', replace: '../../src/' }],
				});
			write('package.json', {
				name: '@octanejs/mit-widget',
				type: 'module',
				exports: './src/index.js',
				dependencies: { 'mit-widget': '1.0.0' },
			});
			// This local dependency models an installed vanilla package, outside the
			// measured binding boundary. It is unchanged throughout cleanup.
			const dependencyRoot = path.join(context.root, 'node_modules/mit-widget');
			mkdirSync(dependencyRoot, { recursive: true });
			writeFileSync(
				path.join(dependencyRoot, 'package.json'),
				JSON.stringify({
					name: 'mit-widget',
					version: '1.0.0',
					type: 'module',
					exports: './index.js',
				}),
			);
			writeFileSync(path.join(dependencyRoot, 'index.js'), engine);
			write(
				'src/index.js',
				"export { engine } from './engine.js';\nexport { copied } from './copied.js';\n",
			);
			write('src/engine.js', engine);
			write('src/copied.js', copied);
			write(
				'tests/consumer.test.mjs',
				`import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engine, copied } from '@octanejs/mit-widget';
import { engine as vanilla } from 'mit-widget';
test('consumer import contract', () => {
	assert.deepEqual([-1, 0.25, 1, 2].map(p => engine(10, 30, p)), [10, 15, 30, 30]);
	assert.equal(engine(30, 10, 0.25), vanilla(30, 10, 0.25));
	assert.equal(copied(), 1);
});
`,
			);
			write(
				'tests/consumer.ts',
				`import { engine, copied } from '@octanejs/mit-widget';
const value: number = engine(10, 30, 0.25) + copied();
`,
			);
			write(
				'tests/invalid-consumer.ts',
				`import { engine, copied } from '@octanejs/mit-widget';
engine('10', 30, 0.25);
const value: string = engine(10, 30, 0.25);
copied(1);
`,
			);
			const checkConsumerTypes = () => {
				for (const [file, expected] of [
					['tests/consumer.ts', []],
					['tests/invalid-consumer.ts', [2345, 2322, 2554]],
				]) {
					const program = ts.createProgram([path.join(context.packageDirectory, file)], {
						strict: true,
						noEmit: true,
						allowJs: true,
						maxNodeModuleJsDepth: 1,
						module: ts.ModuleKind.NodeNext,
						types: [],
					});
					const diagnostics = ts.getPreEmitDiagnostics(program);
					assert.deepEqual(
						diagnostics.map((item) => item.code),
						expected,
						diagnostics
							.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n'))
							.join('\n'),
					);
				}
			};
			const runConsumerTests = () => {
				const env = { ...process.env };
				delete env.NODE_TEST_CONTEXT;
				return execFileSync(process.execPath, ['--test', '--test-reporter=tap'], {
					cwd: context.packageDirectory,
					encoding: 'utf8',
					env,
				});
			};
			const measure = () => {
				const files = readdirSync(context.packageDirectory, {
					recursive: true,
					withFileTypes: true,
				})
					.filter((entry) => entry.isFile())
					.map((entry) => path.join(entry.parentPath, entry.name));
				return {
					files: files.length,
					bytes: files.reduce((sum, file) => sum + readFileSync(file).length, 0),
				};
			};
			const ledger = (names) =>
				names.map((name) => ({
					path: `src/${name}.js`,
					origin: 'adapted',
					packageName: 'mit-widget',
					sha256: hash(sources.get(`src/${name}.js`)),
				}));
			write('audit/source-ledger.json', ledger(['engine', 'copied']));
			write('status.json', {});
			write('LICENSE.upstream', sources.get('LICENSE'));
			write('audit/upstream.lock.json', makeLock());
			const original = await runCli(['run', '--package-dir', context.packageDirectory], {
				fetchImpl: fixtureFetch({ sources }),
			});
			assert.equal(original.exitCode, 0, original.stderr);
			assert.match(runConsumerTests(), /# tests 5\b/);
			checkConsumerTypes();
			const before = measure();

			write(
				'src/index.js',
				"export { engine } from 'mit-widget';\nexport { copied } from './copied.js';\n",
			);
			write('audit/source-ledger.json', ledger(['copied']));
			write('status.json', {
				surfaces: [
					{
						entrypoint: '.',
						exports: ['engine'],
						ownership: 'imported',
						files: ['src/index.js'],
						dependency: { package: 'mit-widget', version: '1.0.0' },
						evidence: ['tests/consumer.ts', 'tests/consumer.test.mjs'],
					},
					{
						entrypoint: '.',
						exports: ['copied'],
						ownership: 'copied',
						files: ['src/copied.js'],
						dependency: { package: 'mit-widget', version: '1.0.0' },
						upstreamPaths: ['src/copied.js', 'tests/copied.test.js'],
						evidence: ['tests/consumer.ts'],
					},
				],
			});
			const broad = await runCli(['run', '--package-dir', context.packageDirectory], {
				fetchImpl: () => {
					throw new Error('Network must not start for an obsolete broad lock');
				},
			});
			assert.equal(broad.exitCode, 2);
			assert.match(broad.stderr, /scope.*lock|lock.*scope/i);
			assert.equal(existsSync(path.join(context.packageDirectory, 'upstream/src/engine.js')), true);
			assert.throws(
				() => discoverMaterializedUpstreamPackages(context.root),
				/scope.*lock|lock.*scope/i,
			);
			assert.throws(
				() =>
					ensureMaterializedUpstream(context.root, {
						spawn: () => {
							throw new Error('Must reject before spawning');
						},
					}),
				/scope.*lock|lock.*scope/i,
			);
			assert.throws(
				() => verifyMaterializedUpstreamEvidence(context.root, 'packages/mit-widget'),
				/scope.*lock|lock.*scope/i,
			);
			write(
				'audit/upstream.lock.json',
				makeLock(['LICENSE', 'src/copied.js', 'tests/copied.test.js']),
			);
			for (const file of ['src/engine.js', 'upstream', 'tests/upstream/engine.test.js']) {
				rmSync(path.join(context.packageDirectory, file), { recursive: true });
			}
			assert.deepEqual(discoverMaterializedUpstreamPackages(context.root), ['packages/mit-widget']);
			const scoped = await runCli(['run', '--package-dir', context.packageDirectory], {
				fetchImpl: fixtureFetch({ sources }),
			});
			assert.equal(scoped.exitCode, 0, scoped.stderr);
			assert.equal(
				existsSync(path.join(context.packageDirectory, 'upstream/src/engine.js')),
				false,
			);
			assert.equal(
				readFileSync(path.join(context.packageDirectory, 'upstream/src/copied.js'), 'utf8'),
				copied,
			);
			assert.equal(
				existsSync(path.join(context.packageDirectory, 'tests/upstream/copied.test.js')),
				true,
			);
			assert.equal(
				verifyMaterializedUpstreamEvidence(context.root, 'packages/mit-widget').files,
				3,
			);
			assert.deepEqual(
				ensureMaterializedUpstream(context.root, {
					spawn: () => {
						throw new Error('Scoped evidence is already materialized');
					},
				}),
				[],
			);
			const retainedTests = () =>
				verifyMaterializedAdaptedEvidence(context.root, 'packages/mit-widget', {
					version: '1.0.0',
					commit: COMMIT,
					repo: 'https://github.com/acme/mit-widget.git',
				});
			assert.deepEqual([...retainedTests()], ['packages/mit-widget/tests/upstream/copied.test.js']);
			assert.match(runConsumerTests(), /# tests 3\b/);
			checkConsumerTypes();
			const after = measure();
			assert.equal(before.files - after.files, 4);
			assert.ok(after.bytes < before.bytes, JSON.stringify({ before, after }));
			t.diagnostic(
				`Binding fixture (all package files): ${before.files} files/${before.bytes} bytes -> ${after.files} files/${after.bytes} bytes; removed ${before.files - after.files} files/${before.bytes - after.bytes} bytes.`,
			);

			// Retaining copied evidence is substantive: missing tests, altered source
			// provenance, and missing attribution must still stop verification.
			rmSync(path.join(context.packageDirectory, 'tests/upstream/copied.test.js'));
			assert.throws(retainedTests, /missing/i);
			const rediscovered = await runCli(['run', '--package-dir', context.packageDirectory], {
				fetchImpl: () => {
					throw new Error('Retained evidence must regenerate offline');
				},
			});
			assert.equal(rediscovered.exitCode, 0, rediscovered.stderr);
			assert.match(runConsumerTests(), /# tests 3\b/);
			assert.deepEqual(measure(), after);
			write('src/copied.js', 'export function copied() { return 2; }\n');
			assert.throws(retainedTests, /provenance/i);
			write('src/copied.js', copied);
			rmSync(path.join(context.packageDirectory, 'LICENSE.upstream'));
			assert.throws(retainedTests, /attribution.*missing/i);
			write('LICENSE.upstream', sources.get('LICENSE'));
			retainedTests();
		} finally {
			rmSync(context.root, { recursive: true, force: true });
		}
	});
	test('removed imported snapshots stay absent through discovery, explicit verification, and direct materialization', async () => {
		const context = scenario();
		try {
			assert.equal((await runCli(LOCK_ARGUMENTS(context))).exitCode, 0);
			mkdirSync(path.join(context.packageDirectory, 'src'));
			mkdirSync(path.join(context.packageDirectory, 'tests'));
			writeFileSync(
				path.join(context.packageDirectory, 'src/index.ts'),
				"export * from 'mit-widget';\n",
			);
			writeFileSync(
				path.join(context.packageDirectory, 'tests/consumer.ts'),
				'export const evidence = true;',
			);
			writeFileSync(
				path.join(context.packageDirectory, 'package.json'),
				JSON.stringify({ exports: './src/index.ts', dependencies: { 'mit-widget': '1.0.0' } }),
			);
			writeFileSync(
				path.join(context.packageDirectory, 'status.json'),
				JSON.stringify({
					surfaces: [
						{
							entrypoint: '.',
							exports: ['*'],
							ownership: 'imported',
							files: ['src/index.ts'],
							dependency: { package: 'mit-widget', version: '1.0.0' },
							evidence: ['tests/consumer.ts'],
						},
					],
				}),
			);
			assert.deepEqual(
				ensureMaterializedUpstream(context.root, {
					spawn: () => {
						throw new Error('Must not regenerate imported snapshots');
					},
				}),
				[],
			);
			assert.deepEqual(discoverMaterializedUpstreamPackages(context.root), []);
			assert.deepEqual(verifyMaterializedUpstreamEvidence(context.root, 'packages/mit-widget'), {
				required: false,
			});
			const result = await runCli(['run', '--package-dir', context.packageDirectory], {
				fetchImpl: () => {
					throw new Error('Must not fetch imported snapshots');
				},
			});
			assert.equal(result.exitCode, 0, result.stderr);
			assert.equal(JSON.parse(result.stdout).mode, 'not-required');
			assert.equal(existsSync(path.join(context.packageDirectory, 'upstream')), false);
			rmSync(path.join(context.packageDirectory, 'status.json'));
			assert.throws(
				() =>
					ensureMaterializedUpstream(context.root, {
						spawn: () => ({ status: 1, stderr: 'Legacy evidence still required' }),
					}),
				/Legacy evidence still required/,
			);
		} finally {
			rmSync(context.root, { recursive: true, force: true });
		}
	});
	test('reuses verified pristine bytes offline when only adapted header rules change', async () => {
		const context = scenario();
		await runCli(LOCK_ARGUMENTS(context));
		await runCli(['run', '--package-dir', context.packageDirectory]);
		const lockPath = path.join(context.packageDirectory, UPSTREAM_LOCK_RELATIVE_PATH);
		const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
		lock.adaptedRewrites = [{ include: '\\.js$', prepend: '// mechanical header\n' }];
		lock.fingerprint = upstreamLockFingerprint(lock);
		writeFileSync(lockPath, JSON.stringify(lock));
		const noNetwork = {
			fetchImpl() {
				throw new Error('network is unavailable');
			},
		};
		const ran = await runCli(['run', '--package-dir', context.packageDirectory], noNetwork);
		assert.equal(ran.exitCode, 0, ran.stderr);
		const adapted = path.join(context.packageDirectory, 'tests/upstream/index.test.js');
		assert.equal(
			readFileSync(adapted, 'utf8'),
			'// mechanical header\n' + FIXTURE_SOURCES.get('tests/index.test.js'),
		);
		const clean = await runCli(['diff', '--package-dir', context.packageDirectory], noNetwork);
		assert.deepEqual(JSON.parse(clean.stdout).patchesWritten, []);
		writeFileSync(path.join(context.packageDirectory, 'upstream/tests/index.test.js'), 'corrupt');
		const corrupt = await runCli(['run', '--package-dir', context.packageDirectory], noNetwork);
		assert.equal(corrupt.exitCode, 2);
	});
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

	test('check fails on pristine drift and committed trees verify offline', async () => {
		const context = scenario();
		await runCli(LOCK_ARGUMENTS(context));
		await runCli(['run', '--package-dir', context.packageDirectory]);
		writeFileSync(path.join(context.packageDirectory, 'upstream', 'src', 'index.js'), 'tampered\n');
		const checked = await runCli(['run', '--check', '--package-dir', context.packageDirectory]);
		assert.equal(checked.exitCode, 2);
		assert.deepEqual(JSON.parse(checked.stdout).mismatched, ['src/index.js']);

		// A committed pristine tree that matches the lock runs fully offline.
		const committed = scenario();
		await runCli(LOCK_ARGUMENTS(committed));
		for (const [relativePath, content] of FIXTURE_SOURCES) {
			const absolutePath = path.join(
				committed.packageDirectory,
				'upstream',
				...relativePath.split('/'),
			);
			mkdirSync(path.dirname(absolutePath), { recursive: true });
			writeFileSync(absolutePath, content);
		}
		execFileSync('git', ['-C', committed.root, 'add', '--force', 'packages/mit-widget/upstream']);
		const offline = await runCli(['run', '--package-dir', committed.packageDirectory], {
			fetchImpl: async () => {
				throw new Error('network must not be used for a committed pristine tree');
			},
		});
		assert.equal(offline.exitCode, 0, offline.stderr);
		assert.equal(JSON.parse(offline.stdout).mode, 'committed');
		assert.equal(
			existsSync(path.join(committed.packageDirectory, 'tests', 'upstream', 'index.test.js')),
			true,
		);

		// A committed tree that stops matching the lock is corruption, not input.
		writeFileSync(
			path.join(committed.packageDirectory, 'upstream', 'src', 'index.js'),
			'tampered\n',
		);
		const corrupted = await runCli(['run', '--package-dir', committed.packageDirectory], {
			fetchImpl: async () => {
				throw new Error('network must not be used for a committed pristine tree');
			},
		});
		assert.equal(corrupted.exitCode, 2);
		assert.match(corrupted.stderr, /must stay byte-exact to the pinned upstream commit/);
	});

	test('adapted rewrites apply mechanically and stay out of patches', async () => {
		const context = scenario();
		const locked = await runCli([
			...LOCK_ARGUMENTS(context),
			'--adapted-rewrite',
			"from 'node:test'=from 'node:test/reporters'",
		]);
		assert.equal(locked.exitCode, 0, locked.stderr);
		await runCli(['run', '--package-dir', context.packageDirectory]);
		const adaptedTest = path.join(context.packageDirectory, 'tests', 'upstream', 'index.test.js');
		assert.match(readFileSync(adaptedTest, 'utf8'), /node:test\/reporters/);
		const clean = await runCli(['diff', '--package-dir', context.packageDirectory]);
		assert.equal(clean.exitCode, 0, clean.stderr);
		assert.deepEqual(JSON.parse(clean.stdout).patchesWritten, []);

		writeFileSync(
			adaptedTest,
			readFileSync(adaptedTest, 'utf8').replace("'widget'", "'octane widget'"),
		);
		const diffed = await runCli(['diff', '--package-dir', context.packageDirectory]);
		assert.equal(diffed.exitCode, 0, diffed.stderr);
		const patch = readFileSync(
			path.join(
				context.packageDirectory,
				'audit',
				'upstream-patches',
				'tests',
				'upstream',
				'index.test.js.patch',
			),
			'utf8',
		);
		assert.match(patch, /octane widget/);
		assert.doesNotMatch(patch, /^[+-].*node:test\/reporters/m);
	});

	test('a formatting-only adaptation fails diff', async () => {
		const context = scenario();
		await runCli(LOCK_ARGUMENTS(context));
		await runCli(['run', '--package-dir', context.packageDirectory]);
		const adaptedTest = path.join(context.packageDirectory, 'tests', 'upstream', 'index.test.js');
		// Rewrap a statement without changing its content.
		const source = readFileSync(adaptedTest, 'utf8');
		const rewrapped = source.replace(
			"test('widget', () => {});",
			"test(\n  'widget',\n  () => {},\n);",
		);
		assert.notEqual(rewrapped, source);
		writeFileSync(adaptedTest, rewrapped);
		const diffed = await runCli(['diff', '--package-dir', context.packageDirectory]);
		assert.notEqual(diffed.exitCode, 0);
		assert.match(diffed.stderr, /formatting-only hunks/);
	});

	test('a patch that reintroduces a React import fails materialization', async () => {
		const context = scenario();
		await runCli(LOCK_ARGUMENTS(context));
		await runCli(['run', '--package-dir', context.packageDirectory]);
		const adaptedTest = path.join(context.packageDirectory, 'tests', 'upstream', 'index.test.js');
		writeFileSync(
			adaptedTest,
			`import { useState } from 'react';\n${readFileSync(adaptedTest, 'utf8')}`,
		);
		const diffed = await runCli(['diff', '--package-dir', context.packageDirectory]);
		assert.equal(diffed.exitCode, 0, diffed.stderr);

		rmSync(path.join(context.packageDirectory, 'tests'), { recursive: true });
		const reran = await runCli(['run', '--package-dir', context.packageDirectory]);
		assert.notEqual(reran.exitCode, 0);
		assert.match(reran.stderr, /still imports React \(react\)/);
		assert.match(reran.stderr, /must execute against Octane/);
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

	test('diff captures multi-megabyte adaptations and apply ignores host autocrlf', async () => {
		const context = scenario();
		await runCli(LOCK_ARGUMENTS(context));
		await runCli(['run', '--package-dir', context.packageDirectory]);
		const adaptedTest = path.join(context.packageDirectory, 'tests', 'upstream', 'index.test.js');
		// Well past Node's 1MB execFileSync default so an unraised maxBuffer fails.
		const bigAdaptation = `${readFileSync(adaptedTest, 'utf8')}${`// adapted line padding\n`.repeat(120_000)}`;
		writeFileSync(adaptedTest, bigAdaptation);
		const diffed = await runCli(['diff', '--package-dir', context.packageDirectory]);
		assert.equal(diffed.exitCode, 0, diffed.stderr);

		rmSync(path.join(context.packageDirectory, 'tests'), { recursive: true });
		const environment = { ...process.env };
		process.env.GIT_CONFIG_COUNT = '1';
		process.env.GIT_CONFIG_KEY_0 = 'core.autocrlf';
		process.env.GIT_CONFIG_VALUE_0 = 'true';
		try {
			const reran = await runCli(['run', '--package-dir', context.packageDirectory]);
			assert.equal(reran.exitCode, 0, reran.stderr);
			assert.equal(readFileSync(adaptedTest, 'utf8'), bigAdaptation);
		} finally {
			delete process.env.GIT_CONFIG_COUNT;
			delete process.env.GIT_CONFIG_KEY_0;
			delete process.env.GIT_CONFIG_VALUE_0;
			for (const key of ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0']) {
				if (environment[key] !== undefined) process.env[key] = environment[key];
			}
		}
	});

	test('lock --pin derives the lock from a reviewed pin with full cross-checks', async () => {
		const context = scenario();
		const registry = {
			name: 'mit-widget',
			version: '1.0.0',
			license: 'MIT',
			dist: { integrity: 'sha512-registry-fixture' },
		};
		const pinArguments = [
			'lock',
			'--pin',
			'mit-widget@1.0.0',
			'--repo',
			'acme/mit-widget',
			'--commit',
			COMMIT,
			'--package-dir',
			context.packageDirectory,
			'--adapted-map',
			'tests=tests/upstream',
		];
		const locked = await runCli(pinArguments, {
			fetchImpl: fixtureFetch({ sources: PIN_FIXTURE_SOURCES, registry }),
		});
		assert.equal(locked.exitCode, 0, locked.stderr);
		const lock = JSON.parse(
			readFileSync(path.join(context.packageDirectory, UPSTREAM_LOCK_RELATIVE_PATH), 'utf8'),
		);
		assert.equal(lock.identity.integrity, 'sha512-registry-fixture');
		assert.equal(lock.license.spdx, 'MIT');
		assert.equal(lock.files.length, 4);
		const ran = await runCli(['run', '--package-dir', context.packageDirectory], {
			fetchImpl: fixtureFetch({ sources: PIN_FIXTURE_SOURCES }),
		});
		assert.equal(ran.exitCode, 0, ran.stderr);

		const mismatched = scenario();
		const wrongManifest = new Map(PIN_FIXTURE_SOURCES);
		wrongManifest.set('package.json', '{"name":"mit-widget","version":"2.0.0","license":"MIT"}\n');
		const refused = await runCli(
			pinArguments.map((argument) =>
				argument === context.packageDirectory ? mismatched.packageDirectory : argument,
			),
			{ fetchImpl: fixtureFetch({ sources: wrongManifest, registry }) },
		);
		assert.equal(refused.exitCode, 2);
		assert.match(refused.stderr, /does not correspond to this commit/);

		const unlicensed = scenario();
		const badLicense = new Map(PIN_FIXTURE_SOURCES);
		badLicense.set('LICENSE', 'All rights reserved.\n');
		const blocked = await runCli(
			pinArguments.map((argument) =>
				argument === context.packageDirectory ? unlicensed.packageDirectory : argument,
			),
			{ fetchImpl: fixtureFetch({ sources: badLicense, registry }) },
		);
		assert.equal(blocked.exitCode, 2);
		assert.match(blocked.stderr, /license evidence is not approved/i);
	});

	test('ensureMaterializedUpstream spawns only for absent or stale trees', async () => {
		const { ensureMaterializedUpstream } = await import('./ensure-materialized.mjs');
		const context = scenario();
		await runCli(LOCK_ARGUMENTS(context));
		await runCli(['run', '--package-dir', context.packageDirectory]);
		const calls = [];
		const spawn = (...spawnArguments) => {
			calls.push(spawnArguments);
			return { status: 0 };
		};
		assert.deepEqual(ensureMaterializedUpstream(context.root, { spawn }), []);
		assert.equal(calls.length, 0);

		rmSync(path.join(context.packageDirectory, 'tests', 'upstream'), { recursive: true });
		assert.deepEqual(ensureMaterializedUpstream(context.root, { spawn }), ['packages/mit-widget']);
		assert.equal(calls.length, 1);

		await runCli(['run', '--package-dir', context.packageDirectory]);
		const markerPath = path.join(context.packageDirectory, 'upstream', '.octane-materialize.json');
		writeFileSync(markerPath, JSON.stringify({ lockFingerprint: 'stale', schemaVersion: 1 }));
		assert.deepEqual(ensureMaterializedUpstream(context.root, { spawn }), ['packages/mit-widget']);
		assert.equal(calls.length, 2);
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
