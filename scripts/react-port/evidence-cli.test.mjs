import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { EVIDENCE_MATRIX_SCHEMA_VERSION, recordEvidence } from './evidence-lib.mjs';
import { assertApprovedGateCommand } from './evidence.mjs';
import { createBatchManifest } from './state-lib.mjs';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const MIT_TEXT =
	'MIT License Copyright Fixture. Permission is hereby granted, free of charge, to any person obtaining a copy. The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY.';

function sha256(content) {
	return createHash('sha256').update(content).digest('hex');
}

function createReadyBatch({ cleanRoomDependency = false, workRootPath = '.react-port-work' } = {}) {
	const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'react-port-evidence-cli-'));
	spawnSync('git', ['init', '--quiet'], { cwd: workspaceRoot });
	mkdirSync(path.join(workspaceRoot, 'scripts/react-port'), { recursive: true });
	copyFileSync(
		path.join(SCRIPT_DIRECTORY, 'type-assertions.d.ts'),
		path.join(workspaceRoot, 'scripts/react-port/type-assertions.d.ts'),
	);
	const workRoot = path.join(workspaceRoot, workRootPath);
	const batchDirectory = path.join(workRoot, 'fixture-batch');
	mkdirSync(batchDirectory, { recursive: true });
	const manifest = createBatchManifest({
		batchId: 'fixture-batch',
		workspaceRoot,
		inventoryFingerprint: 'inventory',
		nodes: {
			'pkg:widget': {
				packageName: 'widget',
				requested: true,
				action: 'create-binding',
				binding: '@octanejs/widget',
				bindingDirectory: 'packages/widget',
				state: 'ready',
				dependsOn: cleanRoomDependency ? ['pkg:react-helper'] : [],
				evidenceFingerprint: 'evidence',
				nodeFingerprint: 'plan',
				identity: { packageName: 'widget', version: '1.0.0', commit: 'a'.repeat(40) },
				upstreamTestInventory: [],
				license: {
					policy: 'approved-license-v2',
					published: {
						status: 'passed',
						spdx: 'MIT',
						evidence: [{ path: 'package/LICENSE', sha256: sha256(MIT_TEXT) }],
						notices: [],
					},
					source: {
						status: 'passed',
						spdx: 'MIT',
						evidence: [{ path: 'LICENSE', sha256: sha256(MIT_TEXT) }],
						notices: [],
					},
				},
			},
			...(cleanRoomDependency
				? {
						'pkg:react-helper': {
							packageName: 'react-helper',
							state: 'verified',
							action: 'reimplement-in-parent',
							dependsOn: [],
							evidenceFingerprint: 'clean-room-evidence',
							nodeFingerprint: 'clean-room-plan',
							copyPermission: 'denied-or-unproven',
							reimplementation: { copySource: false, copyTests: false },
						},
					}
				: {}),
		},
	});
	writeFileSync(
		path.join(batchDirectory, 'manifest.json'),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
	const fixtureBin = path.join(workspaceRoot, '.fixture-bin');
	mkdirSync(fixtureBin);
	const fixturePnpm = path.join(fixtureBin, 'pnpm');
	writeFileSync(
		fixturePnpm,
		`#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
if (process.env.FIXTURE_COUNTER) appendFileSync(process.env.FIXTURE_COUNTER, process.env.FIXTURE_COUNTER_VALUE ?? 'x');
const outputFile = process.argv.find((argument) => argument.startsWith('--outputFile='))?.slice('--outputFile='.length);
for (const arguments_ of JSON.parse(process.env.FIXTURE_NODE_TEST_INVOCATIONS ?? '[]')) {
	const result = spawnSync('node', arguments_, { stdio: 'inherit' });
	if (result.status !== 0) process.exit(result.status ?? 1);
}
if (process.env.REACT_PORT_TEST_REPORT_DIR && process.env.FIXTURE_NO_TEST_REPORT !== '1') {
	const files = JSON.parse(process.env.FIXTURE_REPORT_FILES ?? '["packages/widget/tests/widget.test.ts"]');
	const reportGroups = process.env.FIXTURE_SINGLE_REPORT === '1' ? [files] : files.map((file) => [file]);
	const runners = JSON.parse(process.env.FIXTURE_REPORT_RUNNERS ?? '[]');
	for (const [index, reportFiles] of reportGroups.entries()) {
		const runner = runners[index] ?? 'vitest';
		const reportFile = runner + '-fixture-' + index + '.report.json';
		writeFileSync(path.join(process.env.REACT_PORT_TEST_REPORT_DIR, runner + '-fixture-' + index + '.invocation.json'), JSON.stringify({
			schemaVersion: 1,
			invocationId: 'fixture-' + index,
			runner,
			argv: [runner, 'run'],
			reportFile,
		}));
		writeFileSync(path.join(process.env.REACT_PORT_TEST_REPORT_DIR, reportFile), JSON.stringify({
			numPassedTests: reportFiles.length,
			numFailedTests: 0,
			numPendingTests: Number(process.env.FIXTURE_PENDING_TESTS ?? 0),
			numTodoTests: Number(process.env.FIXTURE_TODO_TESTS ?? 0),
			testResults: reportFiles.map((file) => ({ name: path.join(process.cwd(), file) })),
		}));
	}
} else if (outputFile && process.env.FIXTURE_NO_TEST_REPORT !== '1') {
	writeFileSync(outputFile, JSON.stringify({
		numPassedTests: Number(process.env.FIXTURE_PASSED_TESTS ?? 1),
		numFailedTests: 0,
		testResults: [{ name: path.join(process.cwd(), 'packages/widget/tests/widget.test.ts') }],
	}));
}
if (process.env.FIXTURE_PRINT_NPM_TOKEN === '1') process.stdout.write((process.env.NPM_TOKEN ?? '') + '\\nTests 1 passed (1)');
else if (process.env.FIXTURE_STDOUT) process.stdout.write(process.env.FIXTURE_STDOUT);
else process.stdout.write('Tests 1 passed (1)');
if (process.env.FIXTURE_STDERR) process.stderr.write(process.env.FIXTURE_STDERR);
process.exit(Number(process.env.FIXTURE_EXIT ?? 0));
`,
	);
	chmodSync(fixturePnpm, 0o755);
	return { workspaceRoot, workRoot, batchDirectory };
}

function runEvidence(arguments_, { env = {} } = {}) {
	const workRootIndex = arguments_.indexOf('--work-root');
	const workRoot = workRootIndex === -1 ? null : arguments_[workRootIndex + 1];
	const batchIndex = arguments_.indexOf('--batch');
	const batch = batchIndex === -1 ? null : arguments_[batchIndex + 1];
	let fixturePath = process.env.PATH;
	if (workRoot && batch) {
		const manifest = JSON.parse(readFileSync(path.join(workRoot, batch, 'manifest.json'), 'utf8'));
		fixturePath = `${path.join(manifest.workspaceRoot, '.fixture-bin')}${path.delimiter}${fixturePath}`;
	}
	return spawnSync(process.execPath, [path.join(SCRIPT_DIRECTORY, 'evidence.mjs'), ...arguments_], {
		encoding: 'utf8',
		env: { ...process.env, PATH: fixturePath, ...env },
	});
}

function runNodeTestWrapper(arguments_) {
	const reportDirectory = mkdtempSync(path.join(tmpdir(), 'react-port-node-test-reports-'));
	const result = spawnSync(
		process.execPath,
		[path.join(SCRIPT_DIRECTORY, 'node-test-invocation-wrapper.mjs'), ...arguments_],
		{
			encoding: 'utf8',
			env: { ...process.env, REACT_PORT_TEST_REPORT_DIR: reportDirectory },
		},
	);
	return { reportDirectory, result };
}

function createCompletePackage(root) {
	const packageDirectory = path.join(root, 'packages/widget');
	mkdirSync(path.join(packageDirectory, 'src'), { recursive: true });
	mkdirSync(path.join(packageDirectory, 'tests/types/upstream'), { recursive: true });
	mkdirSync(path.join(packageDirectory, 'tests/types/public'), { recursive: true });
	writeFileSync(
		path.join(packageDirectory, 'package.json'),
		JSON.stringify({
			name: '@octanejs/widget',
			version: '0.1.0',
			license: 'MIT',
			engines: { node: '>=22.22.2' },
			publishConfig: { access: 'public' },
			repository: { directory: 'packages/widget' },
			files: ['src', 'README.md', 'UPSTREAM.md', 'LICENSE'],
			exports: { '.': './src/index.ts' },
			scripts: { test: 'vitest run' },
			peerDependencies: { octane: 'workspace:^0.1.51 || ^0.2.0' },
			devDependencies: { octane: 'workspace:*' },
		}),
	);
	writeFileSync(path.join(packageDirectory, 'src/index.ts'), 'export const widget = true;\n');
	writeFileSync(
		path.join(packageDirectory, 'tests/widget.test.ts'),
		"import { test } from 'node:test';\ntest('exports a widget', () => {});\n",
	);
	for (const [name, compilerOptions] of [
		['pristine', { strict: true, skipLibCheck: false, noEmit: true }],
		['adapted', { strict: true, skipLibCheck: false, noEmit: true }],
	]) {
		const importSpecifier = name === 'pristine' ? 'widget' : '@octanejs/widget';
		writeFileSync(
			path.join(packageDirectory, `tests/types/upstream/${name}.ts`),
			`import { widget } from '${importSpecifier}';\nwidget satisfies boolean;\n// @ts-expect-error widget is the literal true\nconst invalidWidget: typeof widget = false;\n`,
		);
		writeFileSync(
			path.join(packageDirectory, `tests/types/upstream/tsconfig.${name}.json`),
			JSON.stringify({
				compilerOptions: {
					...compilerOptions,
					baseUrl: '.',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					paths: { [importSpecifier]: ['../../../src/index.ts'] },
				},
				files: [`${name}.ts`],
				reactPortEvidence: { gate: `upstream-types-${name}`, upstreamRegistrations: [] },
			}),
		);
	}
	writeFileSync(
		path.join(packageDirectory, 'tests/types/public/public.ts'),
		"import { widget } from '@octanejs/widget';\nwidget satisfies boolean;\n// @ts-expect-error public surface rejects invalid calls\nwidget();\n",
	);
	writeFileSync(
		path.join(packageDirectory, 'tests/types/public/tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				strict: true,
				skipLibCheck: false,
				noEmit: true,
				baseUrl: '.',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				paths: { '@octanejs/widget': ['../../../src/index.ts'] },
			},
			files: ['public.ts'],
			reactPortEvidence: { gate: 'public-types' },
		}),
	);
	writeFileSync(
		path.join(packageDirectory, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: { strict: true, skipLibCheck: false, noEmit: true },
			files: ['src/index.ts'],
			reactPortEvidence: { gate: 'authored-source-types' },
		}),
	);
	writeFileSync(path.join(packageDirectory, 'README.md'), '# Widget\n');
	writeFileSync(path.join(packageDirectory, 'LICENSE'), MIT_TEXT);
	writeFileSync(
		path.join(packageDirectory, 'UPSTREAM.md'),
		`# Upstream\n\nwidget@1.0.0\n\ncommit ${'a'.repeat(40)}\n\n## Source boundary\n\nAdapted public behavior.\n`,
	);
	writeFileSync(
		path.join(packageDirectory, 'status.json'),
		JSON.stringify({
			upstream: { package: 'widget', version: '1.0.0' },
			surface: 'Complete.',
			verified: '2026-08-11',
		}),
	);
	return packageDirectory;
}

function completeClosure(packageDirectory, overrides = {}) {
	return {
		runtimeDependencies: ['octane'],
		adaptedSources: [],
		sourceLedger: [
			{
				path: 'src/index.ts',
				origin: 'authored',
				sha256: sha256(readFileSync(path.join(packageDirectory, 'src/index.ts'))),
			},
		],
		reimplementedDependencies: [],
		...overrides,
	};
}

function recordRequiredEvidence(batchDirectory) {
	const manifestPath = path.join(batchDirectory, 'manifest.json');
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	const automated = new Set([
		'upstream-crosswalk',
		'package-contract',
		'provenance',
		'closure-audit',
	]);
	for (const gate of Object.values(manifest.nodes['pkg:widget'].evidenceMatrix.gates)) {
		if (gate.status !== 'required' || automated.has(gate.id)) continue;
		recordEvidence(manifest.nodes['pkg:widget'].evidenceMatrix, gate.id, {
			status: 'passed',
			command: 'fixture-command',
			observed: 'fixture gate passed',
		});
	}
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

describe('evidence CLI', () => {
	test('leaves an application --test argument outside Node test instrumentation', () => {
		const fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'react-port-node-application-'));
		const applicationPath = path.join(fixtureDirectory, 'prepare.mjs');
		writeFileSync(
			applicationPath,
			"process.stdout.write(`prepare ${process.argv.slice(2).join(' ')}\\n`);\n",
		);

		const { reportDirectory, result } = runNodeTestWrapper([applicationPath, '--test']);

		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout, 'prepare --test\n');
		assert.deepEqual(readdirSync(reportDirectory), []);
	});

	for (const entryOption of ['--eval', '--print']) {
		test(`does not instrument ${entryOption} as a Node test invocation`, () => {
			const { reportDirectory, result } = runNodeTestWrapper([
				entryOption,
				"'application entry point'",
				'--test',
			]);

			assert.notEqual(result.status, 0);
			assert.match(result.stderr, /either --test or --eval/i);
			assert.deepEqual(readdirSync(reportDirectory), []);
		});
	}

	test('preserves an existing Node test reporter while collecting machine evidence', () => {
		const fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'react-port-node-reporter-'));
		const testPath = path.join(fixtureDirectory, 'existing-reporter.test.mjs');
		writeFileSync(
			testPath,
			"import { test } from 'node:test';\ntest('existing reporter remains visible', () => {});\n",
		);

		const { reportDirectory, result } = runNodeTestWrapper([
			'--test',
			'--test-reporter=spec',
			testPath,
		]);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /existing reporter remains visible/);
		assert.match(result.stdout, /# pass 1/);
		assert.equal(
			readdirSync(reportDirectory).filter((name) => name.endsWith('.report.json')).length,
			1,
		);
		assert.equal(
			readdirSync(reportDirectory).filter((name) => name.endsWith('.invocation.json')).length,
			1,
		);
	});

	test('collects machine evidence for a normal Node test invocation', () => {
		const fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'react-port-node-control-'));
		const testPath = path.join(fixtureDirectory, 'control.test.mjs');
		writeFileSync(testPath, "import { test } from 'node:test';\ntest('control', () => {});\n");

		const { reportDirectory, result } = runNodeTestWrapper(['--test', testPath]);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /# tests 1/);
		assert.match(result.stdout, /# pass 1/);
		assert.equal(
			readdirSync(reportDirectory).filter((name) => name.endsWith('.report.json')).length,
			1,
		);
		assert.equal(
			readdirSync(reportDirectory).filter((name) => name.endsWith('.invocation.json')).length,
			1,
		);
	});

	test('maps every command gate family to a specific repository command', () => {
		const node = { bindingDirectory: 'packages/widget' };
		for (const [gateIds, command] of [
			[['package-tests'], ['pnpm', '--dir', 'packages/widget', 'test']],
			[
				['public-exports'],
				['node', 'scripts/react-port/public-exports.mjs', '--package-dir', 'packages/widget'],
			],
			[
				['differential-surface', 'browser'],
				[
					'node',
					'scripts/react-parity/harness.mjs',
					'run-required',
					'--manifest',
					'packages/widget/audit/react-parity.json',
				],
			],
			[
				['upstream-types-pristine'],
				[
					'pnpm',
					'exec',
					'tsc',
					'--noEmit',
					'-p',
					'packages/widget/typetests/tsconfig.pristine.json',
				],
			],
			[
				['upstream-types-adapted'],
				[
					'pnpm',
					'exec',
					'tsrx-tsc',
					'--noEmit',
					'-p',
					'packages/widget/typetests/tsconfig.adapted.json',
				],
			],
			[
				['public-types'],
				['pnpm', 'exec', 'tsrx-tsc', '--noEmit', '-p', 'packages/widget/tests/types/tsconfig.json'],
			],
			[
				['packed-source-types-node', 'packed-source-types-browser', 'package-pack'],
				['pnpm', 'packages:pack:check'],
			],
			[['generated-data'], ['pnpm', 'sync']],
			[['format'], ['pnpm', 'format:check']],
		]) {
			assert.doesNotThrow(() => assertApprovedGateCommand(gateIds, command, node));
		}
		assert.throws(
			() =>
				assertApprovedGateCommand(
					['package-tests', 'format'],
					['pnpm', '--dir', 'packages/widget', 'test'],
					node,
				),
			/approved command for format/i,
		);
		assert.throws(
			() =>
				assertApprovedGateCommand(
					['upstream-types-pristine'],
					[
						'pnpm',
						'exec',
						'tsrx-tsc',
						'--noEmit',
						'-p',
						'packages/widget/typetests/tsconfig.pristine.json',
					],
					node,
				),
			/approved command for upstream-types-pristine/i,
		);
		assert.throws(
			() =>
				assertApprovedGateCommand(
					['upstream-types-adapted'],
					[
						'pnpm',
						'exec',
						'tsc',
						'--noEmit',
						'-p',
						'packages/widget/typetests/tsconfig.adapted.json',
					],
					node,
				),
			/approved command for upstream-types-adapted/i,
		);
	});

	test('rejects no-op tests and semantically weak or empty type projects', () => {
		const { workspaceRoot } = createReadyBatch();
		const packageDirectory = createCompletePackage(workspaceRoot);
		const node = {
			packageName: 'widget',
			binding: '@octanejs/widget',
			bindingDirectory: 'packages/widget',
			upstreamTestInventory: [],
		};
		const validation = { workspaceRoot };

		assert.doesNotThrow(() =>
			assertApprovedGateCommand(
				['authored-source-types'],
				['pnpm', 'exec', 'tsrx-tsc', '--noEmit', '-p', 'packages/widget/tsconfig.json'],
				node,
				validation,
			),
		);
		writeFileSync(
			path.join(packageDirectory, 'src/Omitted.tsrx'),
			'export const omitted = true;\n',
		);
		assert.throws(
			() =>
				assertApprovedGateCommand(
					['authored-source-types'],
					['pnpm', 'exec', 'tsrx-tsc', '--noEmit', '-p', 'packages/widget/tsconfig.json'],
					node,
					validation,
				),
			/omits authored source.*Omitted\.tsrx/i,
		);
		writeFileSync(
			path.join(packageDirectory, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: { strict: false, skipLibCheck: true },
				files: [],
				reactPortEvidence: { gate: 'authored-source-types' },
			}),
		);
		assert.throws(
			() =>
				assertApprovedGateCommand(
					['authored-source-types'],
					['pnpm', 'exec', 'tsrx-tsc', '--noEmit', '-p', 'packages/widget/tsconfig.json'],
					node,
					validation,
				),
			/strict.*skipLibCheck|type project.*source/i,
		);

		const manifestPath = path.join(packageDirectory, 'package.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		manifest.scripts.test = 'true';
		writeFileSync(manifestPath, JSON.stringify(manifest));
		writeFileSync(path.join(packageDirectory, 'tests/widget.test.ts'), 'export {};\n');
		assert.throws(
			() =>
				assertApprovedGateCommand(
					['package-tests'],
					['pnpm', '--dir', 'packages/widget', 'test'],
					node,
					validation,
				),
			/no-op|countable test registrations/i,
		);

		const pinnedTypeNode = {
			...node,
			upstreamTestInventory: [
				{
					kind: 'type',
					registrations: [{ id: 'react-registration-v1:pinned-type-case' }],
				},
			],
		};
		assert.throws(
			() =>
				assertApprovedGateCommand(
					['upstream-types-pristine'],
					[
						'pnpm',
						'exec',
						'tsc',
						'--noEmit',
						'-p',
						'packages/widget/tests/types/upstream/tsconfig.pristine.json',
					],
					pinnedTypeNode,
					validation,
				),
			/pinned immutable type inventory/i,
		);
	});

	test('rejects comment-only public imports and upstream registration mappings', () => {
		const { workspaceRoot } = createReadyBatch();
		const packageDirectory = createCompletePackage(workspaceRoot);
		const node = {
			packageName: 'widget',
			binding: '@octanejs/widget',
			bindingDirectory: 'packages/widget',
			upstreamTestInventory: [
				{
					kind: 'type',
					registrations: [{ id: 'react-registration-v1:pinned-type-case' }],
				},
			],
		};
		const validation = { workspaceRoot };

		writeFileSync(
			path.join(packageDirectory, 'tests/types/public/public.ts'),
			'// @octanejs/widget\n// @ts-expect-error placeholder\nexport {};\n',
		);
		assert.throws(
			() =>
				assertApprovedGateCommand(
					['public-types'],
					[
						'pnpm',
						'exec',
						'tsrx-tsc',
						'--noEmit',
						'-p',
						'packages/widget/tests/types/public/tsconfig.json',
					],
					node,
					validation,
				),
			/public type project must import|omits public entry import|positive type assertion/i,
		);

		for (const name of ['pristine', 'adapted']) {
			writeFileSync(
				path.join(packageDirectory, `tests/types/upstream/tsconfig.${name}.json`),
				JSON.stringify({
					compilerOptions: {
						strict: true,
						skipLibCheck: false,
						noEmit: true,
						baseUrl: '.',
						module: 'ESNext',
						moduleResolution: 'Bundler',
						paths: {
							[name === 'pristine' ? 'widget' : '@octanejs/widget']: ['../../../src/index.ts'],
						},
					},
					files: [`${name}.ts`],
					reactPortEvidence: {
						gate: `upstream-types-${name}`,
						upstreamRegistrations: ['react-registration-v1:pinned-type-case'],
					},
				}),
			);
			writeFileSync(
				path.join(packageDirectory, `tests/types/upstream/${name}.ts`),
				'// react-registration-v1:pinned-type-case\nexport {};\n',
			);
		}
		assert.throws(
			() =>
				assertApprovedGateCommand(
					['upstream-types-pristine'],
					[
						'pnpm',
						'exec',
						'tsc',
						'--noEmit',
						'-p',
						'packages/widget/tests/types/upstream/tsconfig.pristine.json',
					],
					node,
					validation,
				),
			/omits public entry import|does not structurally map pinned registration/i,
		);
		writeFileSync(
			path.join(packageDirectory, 'tests/types/upstream/pristine.ts'),
			"import { widget } from 'widget';\nwidget satisfies boolean;\n// @ts-expect-error widget is the literal true\nconst invalidWidget: typeof widget = false;\nconst upstreamRegistrationMap = { 'react-registration-v1:pinned-type-case': true } as const;\nupstreamRegistrationMap satisfies Record<string, true>;\n",
		);
		assert.throws(
			() =>
				assertApprovedGateCommand(
					['upstream-types-pristine'],
					[
						'pnpm',
						'exec',
						'tsc',
						'--noEmit',
						'-p',
						'packages/widget/tests/types/upstream/tsconfig.pristine.json',
					],
					node,
					validation,
				),
			/real assertion group|structurally map/i,
		);
		writeFileSync(
			path.join(packageDirectory, 'tests/types/upstream/pristine.ts'),
			"import { widget } from 'widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ndeclare function assertUpstreamRegistration(id: string, assertion: () => void): void;\nassertUpstreamRegistration('react-registration-v1:pinned-type-case', () => { type WidgetIsTrue = Assert<Equal<typeof widget, true>>; });\n// @ts-expect-error widget is the literal true\nconst invalidWidget: typeof widget = false;\n",
		);
		assert.doesNotThrow(() =>
			assertApprovedGateCommand(
				['upstream-types-pristine'],
				[
					'pnpm',
					'exec',
					'tsc',
					'--noEmit',
					'-p',
					'packages/widget/tests/types/upstream/tsconfig.pristine.json',
				],
				node,
				validation,
			),
		);
	});

	test('rejects public type probes whose imported API is any or whose negative control is unrelated', () => {
		const { workspaceRoot } = createReadyBatch();
		const packageDirectory = createCompletePackage(workspaceRoot);
		writeFileSync(
			path.join(packageDirectory, 'src/index.ts'),
			'export const widget: any = true;\n',
		);
		writeFileSync(
			path.join(packageDirectory, 'tests/types/public/public.ts'),
			"import { widget } from '@octanejs/widget';\nwidget satisfies boolean;\n// @ts-expect-error widget is not a number\nconst invalidWidget: number = widget;\n",
		);
		assert.throws(
			() =>
				assertApprovedGateCommand(
					['public-types'],
					[
						'pnpm',
						'exec',
						'tsrx-tsc',
						'--noEmit',
						'-p',
						'packages/widget/tests/types/public/tsconfig.json',
					],
					{
						binding: '@octanejs/widget',
						bindingDirectory: 'packages/widget',
						upstreamTestInventory: [],
					},
					{ workspaceRoot },
				),
			/imported public type.*any/i,
		);
		writeFileSync(path.join(packageDirectory, 'src/index.ts'), 'export const widget = true;\n');
		writeFileSync(
			path.join(packageDirectory, 'tests/types/public/public.ts'),
			"import { widget } from '@octanejs/widget';\nwidget satisfies boolean;\nfunction unrelated(widget: number) {\n  // @ts-expect-error shadowed name is not the imported binding\n  const invalid: string = widget;\n}\n",
		);
		assert.throws(
			() =>
				assertApprovedGateCommand(
					['public-types'],
					[
						'pnpm',
						'exec',
						'tsrx-tsc',
						'--noEmit',
						'-p',
						'packages/widget/tests/types/public/tsconfig.json',
					],
					{
						binding: '@octanejs/widget',
						bindingDirectory: 'packages/widget',
						upstreamTestInventory: [],
					},
					{ workspaceRoot },
				),
			/negative control.*imported/i,
		);
	});

	test('accepts public type coverage split across files in one type project', () => {
		const { workspaceRoot } = createReadyBatch();
		const packageDirectory = createCompletePackage(workspaceRoot);
		writeFileSync(
			path.join(packageDirectory, 'src/index.ts'),
			'export const widget = true;\nexport const helper = 1;\n',
		);
		writeFileSync(
			path.join(packageDirectory, 'tests/types/public/widget.ts'),
			"import { widget } from '@octanejs/widget';\nwidget satisfies boolean;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		writeFileSync(
			path.join(packageDirectory, 'tests/types/public/helper.ts'),
			"import { helper } from '@octanejs/widget';\nhelper satisfies number;\n",
		);
		writeFileSync(
			path.join(packageDirectory, 'tests/types/public/tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					strict: true,
					skipLibCheck: false,
					noEmit: true,
					baseUrl: '.',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					paths: { '@octanejs/widget': ['../../../src/index.ts'] },
				},
				files: ['widget.ts', 'helper.ts'],
				reactPortEvidence: { gate: 'public-types' },
			}),
		);

		assert.doesNotThrow(() =>
			assertApprovedGateCommand(
				['public-types'],
				[
					'pnpm',
					'exec',
					'tsrx-tsc',
					'--noEmit',
					'-p',
					'packages/widget/tests/types/public/tsconfig.json',
				],
				{
					binding: '@octanejs/widget',
					bindingDirectory: 'packages/widget',
					upstreamTestInventory: [],
				},
				{ workspaceRoot },
			),
		);
	});

	test('requires a meaningful positive assertion for every imported public export', () => {
		const { workspaceRoot } = createReadyBatch();
		const packageDirectory = createCompletePackage(workspaceRoot);
		writeFileSync(
			path.join(packageDirectory, 'src/index.ts'),
			'export const widget = true;\nexport const helper = 1;\n',
		);
		writeFileSync(
			path.join(packageDirectory, 'tests/types/public/public.ts'),
			"import { widget, helper } from '@octanejs/widget';\nwidget satisfies boolean;\nvoid helper;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);

		assert.throws(
			() =>
				assertApprovedGateCommand(
					['public-types'],
					[
						'pnpm',
						'exec',
						'tsrx-tsc',
						'--noEmit',
						'-p',
						'packages/widget/tests/types/public/tsconfig.json',
					],
					{
						binding: '@octanejs/widget',
						bindingDirectory: 'packages/widget',
						upstreamTestInventory: [],
					},
					{ workspaceRoot },
				),
			/every imported public export.*helper|positive assertion.*helper/i,
		);
	});

	test('rejects nested any and unknown in imported public contracts', () => {
		for (const [label, source] of [
			['return', 'export declare function unsafe(): any;\n'],
			['generic-default-any', 'export declare function unsafe<T = any>(): T;\n'],
			['generic-default-unknown', 'export declare function unsafe<T = unknown>(): T;\n'],
			['property', 'export declare const unsafe: { value: any };\n'],
			['nested-unknown', 'export declare const unsafe: { value: unknown };\n'],
			['promise-argument', 'export declare function unsafe(): Promise<any>;\n'],
			[
				'promise-base',
				'interface UnsafePromise extends Promise<any> {}\nexport declare const unsafe: UnsafePromise;\n',
			],
			[
				'array-base',
				'interface UnsafeArray extends Array<any> {}\nexport declare const unsafe: UnsafeArray;\n',
			],
		]) {
			const { workspaceRoot } = createReadyBatch();
			const packageDirectory = createCompletePackage(workspaceRoot);
			writeFileSync(path.join(packageDirectory, 'src/index.ts'), source);
			const probe = label.startsWith('generic-default')
				? 'unsafe satisfies <T = string>() => T;\n// @ts-expect-error an explicit numeric result is not a string\nconst invalid: string = unsafe<number>();\n'
				: 'unsafe satisfies {};\n// @ts-expect-error public contract rejects an impossible property\nunsafe.__missing;\n';
			writeFileSync(
				path.join(packageDirectory, 'tests/types/public/public.ts'),
				`import { unsafe } from '@octanejs/widget';\n${probe}`,
			);

			assert.throws(
				() =>
					assertApprovedGateCommand(
						['public-types'],
						[
							'pnpm',
							'exec',
							'tsrx-tsc',
							'--noEmit',
							'-p',
							'packages/widget/tests/types/public/tsconfig.json',
						],
						{
							binding: '@octanejs/widget',
							bindingDirectory: 'packages/widget',
							upstreamTestInventory: [],
						},
						{ workspaceRoot },
					),
				/imported public type.*any or unknown/i,
				label,
			);
		}
	});

	test('accepts recursively safe callable and object public contracts', () => {
		const { workspaceRoot } = createReadyBatch();
		const packageDirectory = createCompletePackage(workspaceRoot);
		writeFileSync(
			path.join(packageDirectory, 'src/index.ts'),
			'interface SafePromise extends Promise<{ value: string }> {}\ninterface SafeArray extends Array<string> {}\nexport declare function safe<T = string>(input: { value: T }): { value: T };\nexport declare function load(): SafePromise;\nexport declare function list(): SafeArray;\n',
		);
		writeFileSync(
			path.join(packageDirectory, 'tests/types/public/public.ts'),
			"import { list, load, safe } from '@octanejs/widget';\nsafe satisfies <T = string>(input: { value: T }) => { value: T };\nload satisfies () => Promise<{ value: string }>;\nlist satisfies () => Array<string>;\n// @ts-expect-error safe rejects a mismatched value\nsafe<string>({ value: 1 });\n",
		);

		assert.doesNotThrow(() =>
			assertApprovedGateCommand(
				['public-types'],
				[
					'pnpm',
					'exec',
					'tsrx-tsc',
					'--noEmit',
					'-p',
					'packages/widget/tests/types/public/tsconfig.json',
				],
				{
					binding: '@octanejs/widget',
					bindingDirectory: 'packages/widget',
					upstreamTestInventory: [],
				},
				{ workspaceRoot },
			),
		);
	});

	test('rejects unsafe defaults on public generic type aliases', () => {
		for (const defaultType of ['any', 'unknown']) {
			const { workspaceRoot } = createReadyBatch();
			const packageDirectory = createCompletePackage(workspaceRoot);
			writeFileSync(
				path.join(packageDirectory, 'src/index.ts'),
				`export type Unsafe<T = ${defaultType}> = { value: T };\n`,
			);
			writeFileSync(
				path.join(packageDirectory, 'tests/types/public/public.ts'),
				"import type { Unsafe } from '@octanejs/widget';\ntype Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;\ntype Assert<T extends true> = T;\ntype Shape = Assert<Equal<Unsafe<string>, { value: string }>>;\n// @ts-expect-error Unsafe<string> requires a string value\nconst invalid: Unsafe<string> = { value: 1 };\n",
			);

			assert.throws(
				() =>
					assertApprovedGateCommand(
						['public-types'],
						[
							'pnpm',
							'exec',
							'tsrx-tsc',
							'--noEmit',
							'-p',
							'packages/widget/tests/types/public/tsconfig.json',
						],
						{
							binding: '@octanejs/widget',
							bindingDirectory: 'packages/widget',
							upstreamTestInventory: [],
						},
						{ workspaceRoot },
					),
				/imported public type.*any or unknown/i,
				defaultType,
			);
		}

		const { workspaceRoot } = createReadyBatch();
		const packageDirectory = createCompletePackage(workspaceRoot);
		writeFileSync(
			path.join(packageDirectory, 'src/index.ts'),
			'export type Safe<T = string> = { value: T };\n',
		);
		writeFileSync(
			path.join(packageDirectory, 'tests/types/public/public.ts'),
			"import type { Safe } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype Shape = Assert<Equal<Safe, { value: string }>>;\n// @ts-expect-error Safe uses a string by default\nconst invalid: Safe = { value: 1 };\n",
		);
		assert.doesNotThrow(() =>
			assertApprovedGateCommand(
				['public-types'],
				[
					'pnpm',
					'exec',
					'tsrx-tsc',
					'--noEmit',
					'-p',
					'packages/widget/tests/types/public/tsconfig.json',
				],
				{
					binding: '@octanejs/widget',
					bindingDirectory: 'packages/widget',
					upstreamTestInventory: [],
				},
				{ workspaceRoot },
			),
		);
	});

	test('rejects vacuous satisfies and false bare Equal aliases as positive assertions', () => {
		const { workspaceRoot } = createReadyBatch();
		const packageDirectory = createCompletePackage(workspaceRoot);
		const publicPath = path.join(packageDirectory, 'tests/types/public/public.ts');
		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nwidget satisfies unknown;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		const node = {
			binding: '@octanejs/widget',
			bindingDirectory: 'packages/widget',
			upstreamTestInventory: [],
		};
		assert.throws(
			() =>
				assertApprovedGateCommand(
					['public-types'],
					[
						'pnpm',
						'exec',
						'tsrx-tsc',
						'--noEmit',
						'-p',
						'packages/widget/tests/types/public/tsconfig.json',
					],
					node,
					{ workspaceRoot },
				),
			/positive type assertion/i,
		);
		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\ntype PretendCheck = true extends true ? true : typeof widget;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assert.throws(
			() =>
				assertApprovedGateCommand(
					['public-types'],
					[
						'pnpm',
						'exec',
						'tsrx-tsc',
						'--noEmit',
						'-p',
						'packages/widget/tests/types/public/tsconfig.json',
					],
					node,
					{ workspaceRoot },
				),
			/positive type assertion/i,
		);
		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nwidget satisfies typeof widget;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assert.throws(
			() =>
				assertApprovedGateCommand(
					['public-types'],
					[
						'pnpm',
						'exec',
						'tsrx-tsc',
						'--noEmit',
						'-p',
						'packages/widget/tests/types/public/tsconfig.json',
					],
					node,
					{ workspaceRoot },
				),
			/positive type assertion/i,
		);
		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nwidget satisfies boolean;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assert.doesNotThrow(() =>
			assertApprovedGateCommand(
				['public-types'],
				[
					'pnpm',
					'exec',
					'tsrx-tsc',
					'--noEmit',
					'-p',
					'packages/widget/tests/types/public/tsconfig.json',
				],
				node,
				{ workspaceRoot },
			),
		);

		const registrationId = 'react-registration-v1:pinned-type-case';
		const upstreamPath = path.join(packageDirectory, 'tests/types/upstream/pristine.ts');
		const configPath = path.join(packageDirectory, 'tests/types/upstream/tsconfig.pristine.json');
		const config = JSON.parse(readFileSync(configPath, 'utf8'));
		config.reactPortEvidence.upstreamRegistrations = [registrationId];
		writeFileSync(configPath, JSON.stringify(config));
		writeFileSync(
			upstreamPath,
			`import { widget } from 'widget';\ndeclare function assertUpstreamRegistration(id: string, assertion: () => void): void;\nassertUpstreamRegistration('${registrationId}', () => { type PretendCheck = true extends true ? true : typeof widget; });\n// @ts-expect-error widget is the literal true\nconst invalidWidget: typeof widget = false;\n`,
		);
		assert.throws(
			() =>
				assertApprovedGateCommand(
					['upstream-types-pristine'],
					[
						'pnpm',
						'exec',
						'tsc',
						'--noEmit',
						'-p',
						'packages/widget/tests/types/upstream/tsconfig.pristine.json',
					],
					{
						...node,
						packageName: 'widget',
						upstreamTestInventory: [{ kind: 'type', registrations: [{ id: registrationId }] }],
					},
					{ workspaceRoot },
				),
			/real assertion group|positive(?: type)?(?: and negative)? assertions?/i,
		);

		writeFileSync(
			upstreamPath,
			`import { widget } from 'widget';\ntype Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;\ndeclare function assertUpstreamRegistration(id: string, assertion: () => void): void;\nassertUpstreamRegistration('${registrationId}', () => { type WidgetIsFalse = Equal<typeof widget, false>; });\n// @ts-expect-error widget is the literal true\nconst invalidWidget: typeof widget = false;\n`,
		);
		assert.throws(
			() =>
				assertApprovedGateCommand(
					['upstream-types-pristine'],
					[
						'pnpm',
						'exec',
						'tsc',
						'--noEmit',
						'-p',
						'packages/widget/tests/types/upstream/tsconfig.pristine.json',
					],
					{
						...node,
						packageName: 'widget',
						upstreamTestInventory: [{ kind: 'type', registrations: [{ id: registrationId }] }],
					},
					{ workspaceRoot },
				),
			/real assertion group|positive(?: type)?(?: and negative)? assertions?/i,
		);
	});

	test('rejects positive type assertions that erase or transform the imported binding', () => {
		const { workspaceRoot } = createReadyBatch();
		const packageDirectory = createCompletePackage(workspaceRoot);
		const publicPath = path.join(packageDirectory, 'tests/types/public/public.ts');
		const node = {
			binding: '@octanejs/widget',
			bindingDirectory: 'packages/widget',
			upstreamTestInventory: [],
		};
		const assertRejected = () =>
			assert.throws(
				() =>
					assertApprovedGateCommand(
						['public-types'],
						[
							'pnpm',
							'exec',
							'tsrx-tsc',
							'--noEmit',
							'-p',
							'packages/widget/tests/types/public/tsconfig.json',
						],
						node,
						{ workspaceRoot },
					),
				/positive type assertion/i,
			);

		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype Ignore<Value> = true;\ntype WidgetProof = Assert<Equal<Ignore<typeof widget>, true>>;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assertRejected();
		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype Ignore<Value> = true;\ntype Erased = Ignore<typeof widget>;\ntype WidgetProof = Assert<Equal<Erased, true>>;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assertRejected();
		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype WidgetProof = Assert<Equal<Pick<typeof widget, never>, {}>>;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assertRejected();
		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype WidgetProof = Assert<Equal<Record<never, typeof widget>, {}>>;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assertRejected();
		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype WidgetProof = Assert<Equal<ThisType<typeof widget>, {}>>;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assertRejected();
		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype WidgetProof = Assert<Equal<Extract<typeof widget, never>, never>>;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assertRejected();
		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype WidgetProof = Assert<Equal<Exclude<typeof widget, unknown>, never>>;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assertRejected();
		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype WidgetProof = Assert<Equal<Extract<typeof widget, false>, never>>;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assertRejected();

		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\n[widget].length satisfies number;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assertRejected();
		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nconst length = [widget].length;\nlength satisfies number;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assertRejected();
	});

	test('accepts a direct indexed assertion of a public function parameter', () => {
		const { workspaceRoot } = createReadyBatch();
		const packageDirectory = createCompletePackage(workspaceRoot);
		writeFileSync(
			path.join(packageDirectory, 'src/index.ts'),
			'export function widget(value: string): number { return value.length; }\n',
		);
		writeFileSync(
			path.join(packageDirectory, 'tests/types/public/public.ts'),
			"import { widget } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype FirstParameter = Assert<Equal<Parameters<typeof widget>[0], string>>;\ntype PublicKeys = Assert<Equal<keyof typeof widget, never>>;\n// @ts-expect-error widget requires a string\nwidget(1);\n",
		);

		assert.doesNotThrow(() =>
			assertApprovedGateCommand(
				['public-types'],
				[
					'pnpm',
					'exec',
					'tsrx-tsc',
					'--noEmit',
					'-p',
					'packages/widget/tests/types/public/tsconfig.json',
				],
				{
					binding: '@octanejs/widget',
					bindingDirectory: 'packages/widget',
					upstreamTestInventory: [],
				},
				{ workspaceRoot },
			),
		);
	});

	test('accepts a non-empty projection of a public object type', () => {
		const { workspaceRoot } = createReadyBatch();
		const packageDirectory = createCompletePackage(workspaceRoot);
		writeFileSync(
			path.join(packageDirectory, 'src/index.ts'),
			"export const widget = { label: 'ready', children: 1 } as const;\n",
		);
		const publicPath = path.join(packageDirectory, 'tests/types/public/public.ts');
		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype WidgetWithoutChildren = Assert<Equal<Omit<typeof widget, 'children'>, { readonly label: 'ready' }>>;\n// @ts-expect-error widget label is the literal ready\nconst invalidWidget: typeof widget = { label: 'invalid', children: 1 };\n",
		);

		const command = [
			'pnpm',
			'exec',
			'tsrx-tsc',
			'--noEmit',
			'-p',
			'packages/widget/tests/types/public/tsconfig.json',
		];
		const node = {
			binding: '@octanejs/widget',
			bindingDirectory: 'packages/widget',
			upstreamTestInventory: [],
		};
		assert.doesNotThrow(() =>
			assertApprovedGateCommand(['public-types'], command, node, { workspaceRoot }),
		);

		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype EmptyProjection = Assert<Equal<Omit<typeof widget, keyof typeof widget>, {}>>;\n// @ts-expect-error widget label is the literal ready\nconst invalidWidget: typeof widget = { label: 'invalid', children: 1 };\n",
		);
		assert.throws(
			() => assertApprovedGateCommand(['public-types'], command, node, { workspaceRoot }),
			/positive type assertion/i,
		);
	});

	test('tracks direct namespace-member satisfies assertions by export', () => {
		const { workspaceRoot } = createReadyBatch();
		const packageDirectory = createCompletePackage(workspaceRoot);
		writeFileSync(
			path.join(packageDirectory, 'src/index.ts'),
			'export const widget = true;\nexport const helper = 1;\n',
		);
		const publicPath = path.join(packageDirectory, 'tests/types/public/public.ts');
		writeFileSync(
			publicPath,
			"import * as Widget from '@octanejs/widget';\nWidget.widget satisfies boolean;\n// @ts-expect-error widget is not callable\nWidget.widget();\n",
		);
		const command = [
			'pnpm',
			'exec',
			'tsrx-tsc',
			'--noEmit',
			'-p',
			'packages/widget/tests/types/public/tsconfig.json',
		];
		const node = {
			binding: '@octanejs/widget',
			bindingDirectory: 'packages/widget',
			upstreamTestInventory: [],
		};
		assert.throws(
			() => assertApprovedGateCommand(['public-types'], command, node, { workspaceRoot }),
			/helper/i,
		);

		writeFileSync(
			publicPath,
			"import * as Widget from '@octanejs/widget';\nWidget.widget satisfies boolean;\nWidget.helper satisfies number;\n// @ts-expect-error widget is not callable\nWidget.widget();\n",
		);
		assert.doesNotThrow(() =>
			assertApprovedGateCommand(['public-types'], command, node, { workspaceRoot }),
		);
	});

	test('rejects locally spoofed assertion helpers', () => {
		const { workspaceRoot } = createReadyBatch();
		const packageDirectory = createCompletePackage(workspaceRoot);
		writeFileSync(
			path.join(packageDirectory, 'tests/types/public/public.ts'),
			"import { widget } from '@octanejs/widget';\ndeclare function expectType<T>(value: any): void;\nexpectType<boolean>(widget);\n// @ts-expect-error widget is not callable\nwidget();\n",
		);

		assert.throws(
			() =>
				assertApprovedGateCommand(
					['public-types'],
					[
						'pnpm',
						'exec',
						'tsrx-tsc',
						'--noEmit',
						'-p',
						'packages/widget/tests/types/public/tsconfig.json',
					],
					{
						binding: '@octanejs/widget',
						bindingDirectory: 'packages/widget',
						upstreamTestInventory: [],
					},
					{ workspaceRoot },
				),
			/positive type assertion/i,
		);
	});

	test('requires repository-owned non-reflexive type-alias assertions', () => {
		const { workspaceRoot } = createReadyBatch();
		const packageDirectory = createCompletePackage(workspaceRoot);
		const publicPath = path.join(packageDirectory, 'tests/types/public/public.ts');
		const node = {
			binding: '@octanejs/widget',
			bindingDirectory: 'packages/widget',
			upstreamTestInventory: [],
		};
		const command = [
			'pnpm',
			'exec',
			'tsrx-tsc',
			'--noEmit',
			'-p',
			'packages/widget/tests/types/public/tsconfig.json',
		];

		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype Reflexive = Assert<Equal<typeof widget, typeof widget>>;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assert.throws(
			() => assertApprovedGateCommand(['public-types'], command, node, { workspaceRoot }),
			/positive type assertion/i,
		);
		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype ReflexiveExpected = Assert<Equal<typeof widget, typeof widget extends typeof widget ? true : false>>;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assert.throws(
			() => assertApprovedGateCommand(['public-types'], command, node, { workspaceRoot }),
			/positive type assertion/i,
		);

		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype ReflexiveConditional = Assert<Equal<typeof widget extends typeof widget ? true : false, true>>;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assert.throws(
			() => assertApprovedGateCommand(['public-types'], command, node, { workspaceRoot }),
			/positive type assertion/i,
		);

		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nimport type { Assert } from '../../../../../scripts/react-port/type-assertions.js';\ntype Equal<Left, Right> = true;\ntype Spoofed = Assert<Equal<typeof widget, false>>;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assert.throws(
			() => assertApprovedGateCommand(['public-types'], command, node, { workspaceRoot }),
			/positive type assertion/i,
		);

		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype WidgetIsTrue = Assert<Equal<typeof widget, true>>;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assert.doesNotThrow(() =>
			assertApprovedGateCommand(['public-types'], command, node, { workspaceRoot }),
		);

		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype WrappedWidgetIsTrue = Assert<Equal<Promise<typeof widget>, Promise<true>>>;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assert.doesNotThrow(() =>
			assertApprovedGateCommand(['public-types'], command, node, { workspaceRoot }),
		);

		writeFileSync(
			publicPath,
			"import { widget } from '@octanejs/widget';\nimport type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';\ntype PreservedWidgetIsTrue = Assert<Equal<NoInfer<typeof widget>, true>>;\n// @ts-expect-error widget is not callable\nwidget();\n",
		);
		assert.doesNotThrow(() =>
			assertApprovedGateCommand(['public-types'], command, node, { workspaceRoot }),
		);
	});

	test('accepts dynamic package registrations when the machine report proves execution', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		writeFileSync(
			path.join(packageDirectory, 'tests/widget.test.ts'),
			"import { test } from 'vitest';\nconst cases = ['one', 'two'];\ntest('function callback', function () {});\ntest.each(cases)('case %s', () => {});\nfor (const value of cases) test(`loop ${value}`, () => {});\n",
		);

		const result = runEvidence([
			'run',
			...common,
			'--gate',
			'package-tests',
			'--',
			'pnpm',
			'--dir',
			'packages/widget',
			'test',
		]);

		assert.equal(result.status, 0, result.stderr || result.stdout);
	});

	test('uses the selected Vitest project report instead of source imports for ownership', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		const manifestPath = path.join(packageDirectory, 'package.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		manifest.scripts.test = 'vitest run --root ../.. --project widget';
		writeFileSync(manifestPath, JSON.stringify(manifest));
		writeFileSync(
			path.join(packageDirectory, 'tests/widget.test.ts'),
			"import { test } from 'vitest';\ntest('first lane', () => {});\n",
		);
		mkdirSync(path.join(packageDirectory, 'tests/browser'), { recursive: true });
		writeFileSync(
			path.join(packageDirectory, 'tests/browser/popper.browser.test.ts'),
			"import { test } from 'vitest';\ntest('unselected browser project', () => {});\n",
		);

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{
				env: {
					FIXTURE_REPORT_FILES: JSON.stringify(['packages/widget/tests/widget.test.ts']),
				},
			},
		);

		assert.equal(result.status, 0, result.stderr || result.stdout);
	});

	test('rejects runner reports that name files outside test-owned layouts', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		mkdirSync(path.join(packageDirectory, 'upstream/fixtures'), { recursive: true });
		writeFileSync(path.join(packageDirectory, 'upstream/fixtures/setup.js'), 'export {};\n');

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{
				env: {
					FIXTURE_REPORT_FILES: JSON.stringify(['packages/widget/upstream/fixtures/setup.js']),
				},
			},
		);

		assert.equal(result.status, 2);
		assert.match(result.stdout, /report.*non-test package file/i);
	});

	for (const suiteSource of [
		"test('runner-selected Jest suite', () => {});\n",
		"require('../register-shared-suite.cjs')();\n",
	]) {
		test(`accepts a runner-owned plain Jest entry as the only package suite (${suiteSource.startsWith('require') ? 'imported registration' : 'direct registration'})`, () => {
			const { workspaceRoot, workRoot } = createReadyBatch();
			const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
			assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
			const packageDirectory = createCompletePackage(workspaceRoot);
			const manifestPath = path.join(packageDirectory, 'package.json');
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
			manifest.scripts.test = 'jest --runInBand';
			writeFileSync(manifestPath, JSON.stringify(manifest));
			writeFileSync(path.join(packageDirectory, 'tests/widget.test.ts'), 'export {};\n');
			mkdirSync(path.join(packageDirectory, '__tests__'), { recursive: true });
			writeFileSync(path.join(packageDirectory, '__tests__/render.js'), suiteSource);
			writeFileSync(
				path.join(packageDirectory, 'register-shared-suite.cjs'),
				"module.exports = () => { test('shared behavior', () => {}); };\n",
			);

			const result = runEvidence(
				[
					'run',
					...common,
					'--gate',
					'package-tests',
					'--',
					'pnpm',
					'--dir',
					'packages/widget',
					'test',
				],
				{
					env: {
						FIXTURE_REPORT_FILES: JSON.stringify(['packages/widget/__tests__/render.js']),
						FIXTURE_REPORT_RUNNERS: JSON.stringify(['jest']),
					},
				},
			);

			assert.equal(result.status, 0, result.stderr || result.stdout);
		});
	}

	test('accepts a runner-owned plain filename inside a package __tests__ directory', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		mkdirSync(path.join(packageDirectory, 'upstream/__tests__'), { recursive: true });
		writeFileSync(
			path.join(packageDirectory, 'upstream/__tests__/render.js'),
			"test('runner-selected Jest suite', () => {});\n",
		);

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{
				env: {
					FIXTURE_REPORT_FILES: JSON.stringify(['packages/widget/upstream/__tests__/render.js']),
				},
			},
		);

		assert.equal(result.status, 0, result.stderr || result.stdout);
	});

	test('does not require Vitest reports to cover sibling Node or Playwright specs', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		writeFileSync(
			path.join(packageDirectory, 'tests/widget.test.ts'),
			"import { test } from 'vitest';\ntest('vitest lane', () => {});\n",
		);
		writeFileSync(
			path.join(packageDirectory, 'tests/node.test.mjs'),
			"import { test } from 'node:test';\ntest('node lane', () => {});\n",
		);
		writeFileSync(
			path.join(packageDirectory, 'tests/browser.test.ts'),
			"import { test } from '@playwright/test';\ntest('browser lane', () => {});\n",
		);

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{
				env: {
					FIXTURE_REPORT_FILES: JSON.stringify(['packages/widget/tests/widget.test.ts']),
				},
			},
		);

		assert.equal(result.status, 0, result.stderr || result.stdout);
	});

	test('merges machine reports from every Vitest command in a chained package script', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		const manifestPath = path.join(packageDirectory, 'package.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		manifest.scripts.test =
			'vitest run --root ../.. --project widget && vitest run --root ../.. --project widget-differential';
		writeFileSync(manifestPath, JSON.stringify(manifest));
		writeFileSync(
			path.join(packageDirectory, 'tests/widget-differential.test.ts'),
			"import { test } from 'vitest';\ntest('differential', () => {});\n",
		);

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{
				env: {
					FIXTURE_REPORT_FILES: JSON.stringify([
						'packages/widget/tests/widget.test.ts',
						'packages/widget/tests/widget-differential.test.ts',
					]),
				},
			},
		);

		assert.equal(result.status, 0, result.stderr || result.stdout);
	});

	test('rejects repeated Node commands that cannot prove distinct test-file execution', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		const manifestPath = path.join(packageDirectory, 'package.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		manifest.scripts.test = 'node --test tests/widget.test.ts && node --test tests/widget.test.ts';
		writeFileSync(manifestPath, JSON.stringify(manifest));
		writeFileSync(
			path.join(packageDirectory, 'tests/omitted.test.mjs'),
			"import { test } from 'node:test';\ntest('must not be omitted', () => {});\n",
		);

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{
				env: {
					FIXTURE_STDOUT:
						'TAP version 13\n# tests 1\n# pass 1\n# fail 0\n# skipped 0\n# todo 0\nTAP version 13\n# tests 1\n# pass 1\n# fail 0\n# skipped 0\n# todo 0\n',
				},
			},
		);

		assert.equal(result.status, 2);
		assert.match(result.stderr, /multiple Node test invocations.*file identit/i);
	});

	test('does not treat a shared Node test helper as an omitted standalone suite', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		const manifestPath = path.join(packageDirectory, 'package.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		manifest.scripts.test = 'node --test tests/first.test.mjs && node --test tests/second.test.mjs';
		writeFileSync(manifestPath, JSON.stringify(manifest));
		writeFileSync(path.join(packageDirectory, 'tests/widget.test.ts'), 'export {};\n');
		writeFileSync(
			path.join(packageDirectory, 'tests/test-helper.mjs'),
			"export { test } from 'node:test';\n",
		);
		for (const name of ['first', 'second']) {
			writeFileSync(
				path.join(packageDirectory, `tests/${name}.test.mjs`),
				`import { test } from './test-helper.mjs';\ntest('${name} lane', () => {});\n`,
			);
		}

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{
				env: {
					FIXTURE_NO_TEST_REPORT: '1',
					FIXTURE_NODE_TEST_INVOCATIONS: JSON.stringify(
						['first', 'second'].map((name) => [
							'--test',
							path.resolve(workspaceRoot, `packages/widget/tests/${name}.test.mjs`),
						]),
					),
				},
			},
		);

		assert.equal(result.status, 0, result.stderr || result.stdout);
	});

	test('rejects a skipped Node test lane behind a successful or-chain', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		const manifestPath = path.join(packageDirectory, 'package.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		manifest.scripts.test =
			'node --test tests/primary.test.mjs || node --test tests/fallback.test.mjs';
		writeFileSync(manifestPath, JSON.stringify(manifest));
		writeFileSync(path.join(packageDirectory, 'tests/widget.test.ts'), 'export {};\n');
		writeFileSync(
			path.join(packageDirectory, 'tests/primary.test.mjs'),
			"import { test } from 'node:test';\ntest('primary lane', () => {});\n",
		);
		writeFileSync(
			path.join(packageDirectory, 'tests/fallback.test.mjs'),
			"import { test } from 'node:test';\ntest('fallback lane', () => {});\n",
		);

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{
				env: {
					FIXTURE_NO_TEST_REPORT: '1',
					FIXTURE_NODE_TEST_INVOCATIONS: JSON.stringify([
						['--test', 'packages/widget/tests/primary.test.mjs'],
					]),
				},
			},
		);

		assert.equal(result.status, 2);
		assert.match(result.stdout, /1 machine-readable invocation record.*2 required/i);
	});

	for (const runtimePrefix of [
		{
			name: '--env-file',
			packageValue: 'tests/node.env',
			invocationValue: 'packages/widget/tests/node.env',
			setup(packageDirectory) {
				writeFileSync(path.join(packageDirectory, 'tests/node.env'), 'NODE_TEST_FIXTURE=1\n');
			},
		},
		{
			name: '--experimental-loader',
			packageValue: './tests/node-loader.mjs',
			invocationValue: './packages/widget/tests/node-loader.mjs',
			setup(packageDirectory) {
				writeFileSync(
					path.join(packageDirectory, 'tests/node-loader.mjs'),
					'export async function resolve(specifier, context, nextResolve) { return nextResolve(specifier, context); }\n',
				);
			},
		},
		{
			name: '--tls-min-v1.0',
			packageValue: null,
			invocationValue: null,
			setup() {},
		},
		{
			name: '--max-old-space-size=64',
			packageValue: null,
			invocationValue: null,
			setup() {},
		},
		{
			name: '--stack_size=2048',
			packageValue: null,
			invocationValue: null,
			setup() {},
		},
		{
			name: '--no-lazy',
			packageValue: null,
			invocationValue: null,
			setup() {},
		},
	]) {
		test(`plans and instruments a Node test lane prefixed by ${runtimePrefix.name}`, () => {
			const { workspaceRoot, workRoot, batchDirectory } = createReadyBatch();
			const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
			assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
			const packageDirectory = createCompletePackage(workspaceRoot);
			const manifestPath = path.join(packageDirectory, 'package.json');
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
			manifest.scripts.test = [
				'node',
				runtimePrefix.name,
				runtimePrefix.packageValue,
				'--test tests/widget-node.test.mjs',
			]
				.filter(Boolean)
				.join(' ');
			writeFileSync(manifestPath, JSON.stringify(manifest));
			writeFileSync(path.join(packageDirectory, 'tests/widget.test.ts'), 'export {};\n');
			writeFileSync(
				path.join(packageDirectory, 'tests/widget-node.test.mjs'),
				"import { test } from 'node:test';\ntest('prefixed node lane', () => {});\n",
			);
			runtimePrefix.setup(packageDirectory);

			const result = runEvidence(
				[
					'run',
					...common,
					'--gate',
					'package-tests',
					'--',
					'pnpm',
					'--dir',
					'packages/widget',
					'test',
				],
				{
					env: {
						FIXTURE_NO_TEST_REPORT: '1',
						FIXTURE_NODE_TEST_INVOCATIONS: JSON.stringify([
							[
								runtimePrefix.name,
								...(runtimePrefix.invocationValue
									? [path.resolve(workspaceRoot, runtimePrefix.invocationValue)]
									: []),
								'--test',
								path.resolve(workspaceRoot, 'packages/widget/tests/widget-node.test.mjs'),
							],
						]),
					},
				},
			);

			assert.equal(result.status, 0, result.stderr || result.stdout);
			const batchManifest = JSON.parse(
				readFileSync(path.join(batchDirectory, 'manifest.json'), 'utf8'),
			);
			assert.equal(
				batchManifest.nodes['pkg:widget'].evidenceMatrix.gates['package-tests'].status,
				'passed',
			);
		});
	}

	test('combines independently validated Node and Vitest evidence', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		const manifestPath = path.join(packageDirectory, 'package.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		manifest.scripts.test = 'node --test tests/widget-node.test.mjs && vitest run --project widget';
		writeFileSync(manifestPath, JSON.stringify(manifest));
		writeFileSync(
			path.join(packageDirectory, 'tests/widget.test.ts'),
			"import { test } from 'vitest';\ntest('vitest primary lane', () => {});\n",
		);
		writeFileSync(
			path.join(packageDirectory, 'tests/widget-node.test.mjs'),
			"import { test } from 'node:test';\ntest('node lane', () => {});\n",
		);
		writeFileSync(
			path.join(packageDirectory, 'tests/widget-vitest.test.ts'),
			"import { test } from 'vitest';\ntest('vitest lane', () => {});\n",
		);

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{
				env: {
					FIXTURE_REPORT_FILES: JSON.stringify(['packages/widget/tests/widget-vitest.test.ts']),
					FIXTURE_NODE_TEST_INVOCATIONS: JSON.stringify([
						['--test', 'packages/widget/tests/widget-node.test.mjs'],
					]),
				},
			},
		);

		assert.equal(result.status, 0, result.stderr || result.stdout);
	});

	test('combines independently validated Node and parity evidence', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		const manifestPath = path.join(packageDirectory, 'package.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		manifest.scripts.test =
			'node --test tests/widget-node.test.mjs && node ../../scripts/react-parity/harness.mjs run-required --manifest packages/widget/audit/react-parity.json';
		writeFileSync(manifestPath, JSON.stringify(manifest));
		writeFileSync(path.join(packageDirectory, 'tests/widget.test.ts'), 'export {};\n');
		writeFileSync(
			path.join(packageDirectory, 'tests/widget-node.test.mjs'),
			"import { test } from 'node:test';\ntest('node lane', () => {});\n",
		);

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{
				env: {
					FIXTURE_NO_TEST_REPORT: '1',
					FIXTURE_NODE_TEST_INVOCATIONS: JSON.stringify([
						['--test', 'packages/widget/tests/widget-node.test.mjs'],
					]),
				},
			},
		);

		assert.equal(result.status, 0, result.stderr || result.stdout);
	});

	test('merges machine reports from Jest and Vitest in one package script', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		const manifestPath = path.join(packageDirectory, 'package.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		manifest.scripts.test = 'jest --runInBand && vitest run --project widget';
		writeFileSync(manifestPath, JSON.stringify(manifest));
		writeFileSync(
			path.join(packageDirectory, 'tests/widget-jest.test.ts'),
			"test('jest lane', () => {});\n",
		);

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{
				env: {
					FIXTURE_REPORT_FILES: JSON.stringify([
						'packages/widget/tests/widget-jest.test.ts',
						'packages/widget/tests/widget.test.ts',
					]),
					FIXTURE_REPORT_RUNNERS: JSON.stringify(['jest', 'vitest']),
				},
			},
		);

		assert.equal(result.status, 0, result.stderr || result.stdout);
	});

	test('accepts runner-owned Jest tests from a top-level upstream directory', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		const manifestPath = path.join(packageDirectory, 'package.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		manifest.scripts.test =
			'jest --config tests/upstream-jest.config.cjs --rootDir upstream --runInBand && vitest run --project widget';
		writeFileSync(manifestPath, JSON.stringify(manifest));
		mkdirSync(path.join(packageDirectory, 'upstream/test'), { recursive: true });
		writeFileSync(
			path.join(packageDirectory, 'upstream/test/TransitionGroup-test.js'),
			"test('upstream transition group lane', () => {});\n",
		);

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{
				env: {
					FIXTURE_REPORT_FILES: JSON.stringify([
						'packages/widget/upstream/test/TransitionGroup-test.js',
						'packages/widget/tests/widget.test.ts',
					]),
					FIXTURE_REPORT_RUNNERS: JSON.stringify(['jest', 'vitest']),
				},
			},
		);

		assert.equal(result.status, 0, result.stderr || result.stdout);
	});

	test('accepts conditional-only package test registrations when the runner executes them', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		writeFileSync(
			path.join(packageDirectory, 'tests/widget.test.ts'),
			"import { test } from 'vitest';\ntest.runIf(true)('enabled lane', () => {});\ntest.skipIf(false)('unblocked lane', () => {});\n",
		);

		const result = runEvidence([
			'run',
			...common,
			'--gate',
			'package-tests',
			'--',
			'pnpm',
			'--dir',
			'packages/widget',
			'test',
		]);

		assert.equal(result.status, 0, result.stderr || result.stdout);
	});

	test('requires a machine report from every chained test-runner invocation', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		const manifestPath = path.join(packageDirectory, 'package.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		manifest.scripts.test = 'vitest run --project widget && vitest run --project differential';
		writeFileSync(manifestPath, JSON.stringify(manifest));
		writeFileSync(
			path.join(packageDirectory, 'tests/widget-differential.test.ts'),
			"import { test } from 'vitest';\ntest('differential', () => {});\n",
		);

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{
				env: {
					FIXTURE_SINGLE_REPORT: '1',
					FIXTURE_REPORT_FILES: JSON.stringify([
						'packages/widget/tests/widget.test.ts',
						'packages/widget/tests/widget-differential.test.ts',
					]),
				},
			},
		);

		assert.equal(result.status, 2);
		assert.match(result.stdout, /created 1 machine-readable.*for 2 required test-runner/i);
	});

	test('rejects todo registrations when a runner also reports zero pending tests', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		createCompletePackage(workspaceRoot);

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{ env: { FIXTURE_PENDING_TESTS: '0', FIXTURE_TODO_TESTS: '1' } },
		);

		assert.equal(result.status, 2);
		assert.match(result.stdout, /complete passing registration set/i);
	});

	test('accepts existing workspace package test registration patterns before execution', () => {
		const workspaceRoot = path.resolve(SCRIPT_DIRECTORY, '../..');
		const failures = [];
		for (const directory of readdirSync(path.join(workspaceRoot, 'packages'))) {
			const manifestPath = path.join(workspaceRoot, 'packages', directory, 'package.json');
			if (!existsSync(manifestPath)) continue;
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
			if (!manifest.name?.startsWith('@octanejs/') || !manifest.scripts?.test) continue;
			try {
				assertApprovedGateCommand(
					['package-tests'],
					['pnpm', '--dir', `packages/${directory}`, 'test'],
					{ bindingDirectory: `packages/${directory}` },
					{ workspaceRoot },
				);
			} catch (error) {
				failures.push(`${directory}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		assert.deepEqual(failures, []);
	});

	test('rejects package-test evidence that never runs a passing test', () => {
		const { workspaceRoot, workRoot, batchDirectory } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		const manifestPath = path.join(packageDirectory, 'package.json');
		const packageManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		packageManifest.scripts.test = `node -e "console.log('not running Vitest')"`;
		writeFileSync(manifestPath, JSON.stringify(packageManifest));
		writeFileSync(
			path.join(packageDirectory, 'tests/widget.test.ts'),
			"import { test } from 'vitest';\ntest.skip('placeholder', () => {});\n",
		);

		const result = runEvidence([
			'run',
			...common,
			'--gate',
			'package-tests',
			'--',
			'pnpm',
			'--dir',
			'packages/widget',
			'test',
		]);

		assert.equal(result.status, 2);
		assert.match(result.stderr, /must run Vitest|runnable test registrations/i);
		const manifest = JSON.parse(readFileSync(path.join(batchDirectory, 'manifest.json'), 'utf8'));
		assert.equal(
			manifest.nodes['pkg:widget'].evidenceMatrix.gates['package-tests'].status,
			'required',
		);
	});

	test('rejects successful package-test output without an executed passing test', () => {
		const { workspaceRoot, workRoot, batchDirectory } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		createCompletePackage(workspaceRoot);

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{
				env: {
					FIXTURE_NO_TEST_REPORT: '1',
					FIXTURE_STDOUT: 'application log: 1 test passed\nTests 1 skipped (1)',
				},
			},
		);

		assert.equal(result.status, 2);
		const manifest = JSON.parse(readFileSync(path.join(batchDirectory, 'manifest.json'), 'utf8'));
		assert.equal(
			manifest.nodes['pkg:widget'].evidenceMatrix.gates['package-tests'].status,
			'failed',
		);
		assert.match(
			manifest.nodes['pkg:widget'].evidenceMatrix.gates['package-tests'].observed,
			/machine-readable (?:invocation record|report)/i,
		);
	});

	test('rejects forged Vitest summaries from a non-running package script', () => {
		const { workspaceRoot, workRoot, batchDirectory } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		const manifestPath = path.join(packageDirectory, 'package.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		manifest.scripts.test = 'vitest --version && echo "Tests 1 passed (1)"';
		writeFileSync(manifestPath, JSON.stringify(manifest));

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{ env: { FIXTURE_STDOUT: 'vitest/4.1.10\nTests 1 passed (1)' } },
		);

		assert.equal(result.status, 2);
		assert.match(
			result.stderr,
			/machine-readable|test report|executed passing test|must run Vitest/i,
		);
		const batchManifest = JSON.parse(
			readFileSync(path.join(batchDirectory, 'manifest.json'), 'utf8'),
		);
		assert.equal(
			batchManifest.nodes['pkg:widget'].evidenceMatrix.gates['package-tests'].status,
			'required',
		);
	});

	test('requires Node runner evidence to report a complete passing test set', () => {
		const { workspaceRoot, workRoot, batchDirectory } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		const manifestPath = path.join(packageDirectory, 'package.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		manifest.scripts.test = 'node --test tests/widget-node.test.mjs';
		writeFileSync(manifestPath, JSON.stringify(manifest));
		writeFileSync(path.join(packageDirectory, 'tests/widget.test.ts'), 'export {};\n');
		writeFileSync(
			path.join(packageDirectory, 'tests/widget-node.test.mjs'),
			"import { test } from 'node:test';\ntest('first case', () => {});\ntest.skip('second case', () => {});\n",
		);

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{
				env: {
					FIXTURE_NO_TEST_REPORT: '1',
					FIXTURE_NODE_TEST_INVOCATIONS: JSON.stringify([
						['--test', 'packages/widget/tests/widget-node.test.mjs'],
					]),
				},
			},
		);

		assert.equal(result.status, 2);
		const batchManifest = JSON.parse(
			readFileSync(path.join(batchDirectory, 'manifest.json'), 'utf8'),
		);
		assert.equal(
			batchManifest.nodes['pkg:widget'].evidenceMatrix.gates['package-tests'].status,
			'failed',
		);
		assert.match(
			batchManifest.nodes['pkg:widget'].evidenceMatrix.gates['package-tests'].observed,
			/complete passing registration set/i,
		);
	});

	test('rejects a successful command that is not owned by the requested gate', () => {
		const { workRoot, batchDirectory } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);

		const result = runEvidence(['run', ...common, '--gate', 'package-tests', '--', 'true']);

		assert.equal(result.status, 2);
		assert.match(result.stderr, /approved command for package-tests/i);
		const manifest = JSON.parse(readFileSync(path.join(batchDirectory, 'manifest.json'), 'utf8'));
		assert.equal(
			manifest.nodes['pkg:widget'].evidenceMatrix.gates['package-tests'].status,
			'required',
		);
	});

	test('accepts one leading pnpm separator while preserving the run command separator', () => {
		const { workspaceRoot, workRoot, batchDirectory } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		const initialized = runEvidence(['--', 'init', ...common, '--category', 'thin-core']);
		assert.equal(initialized.status, 0, initialized.stderr);
		createCompletePackage(workspaceRoot);

		const recorded = runEvidence(
			[
				'--',
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{ env: { FIXTURE_STDOUT: 'Tests 1 passed (1); separator preserved' } },
		);
		assert.equal(recorded.status, 0, recorded.stderr || recorded.stdout);
		const manifest = JSON.parse(readFileSync(path.join(batchDirectory, 'manifest.json'), 'utf8'));
		assert.equal(
			manifest.nodes['pkg:widget'].evidenceMatrix.gates['package-tests'].observed,
			'Tests 1 passed (1); separator preserved',
		);
	});

	test('moves a ready node to implementing and records observed gate evidence', () => {
		const { workspaceRoot, workRoot, batchDirectory } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		const initialized = runEvidence(['init', ...common, '--category', 'thin-core']);
		assert.equal(initialized.status, 0, initialized.stderr);
		createCompletePackage(workspaceRoot);

		const recorded = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{ env: { FIXTURE_STDOUT: 'Tests 12 passed (12)' } },
		);
		assert.equal(recorded.status, 0, recorded.stderr || recorded.stdout);
		const manifest = JSON.parse(readFileSync(path.join(batchDirectory, 'manifest.json'), 'utf8'));
		assert.equal(manifest.nodes['pkg:widget'].state, 'implementing');
		assert.equal(
			manifest.nodes['pkg:widget'].evidenceMatrix.gates['package-tests'].status,
			'passed',
		);
		assert.match(
			manifest.nodes['pkg:widget'].evidenceMatrix.gates['package-tests'].observed,
			/Tests 12 passed/,
		);
	});

	test('counts local package tests without parsing vendored upstream suites', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const packageDirectory = createCompletePackage(workspaceRoot);
		mkdirSync(path.join(packageDirectory, 'upstream'), { recursive: true });
		writeFileSync(
			path.join(packageDirectory, 'upstream/vendor.test.ts'),
			"test.each(vendoredCases)('vendored %s', value => value);\n",
		);

		const recorded = runEvidence([
			'run',
			...common,
			'--gate',
			'package-tests',
			'--',
			'pnpm',
			'--dir',
			'packages/widget',
			'test',
		]);

		assert.equal(recorded.status, 0, recorded.stderr);
	});

	test('records command failures and rejects unexecuted command claims', () => {
		const { workspaceRoot, workRoot, batchDirectory } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		createCompletePackage(workspaceRoot);

		const failed = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{ env: { FIXTURE_STDERR: 'fixture failed', FIXTURE_EXIT: '3' } },
		);
		assert.equal(failed.status, 2);
		const manifest = JSON.parse(readFileSync(path.join(batchDirectory, 'manifest.json'), 'utf8'));
		assert.equal(
			manifest.nodes['pkg:widget'].evidenceMatrix.gates['package-tests'].status,
			'failed',
		);
		assert.match(
			manifest.nodes['pkg:widget'].evidenceMatrix.gates['package-tests'].observed,
			/fixture failed/,
		);

		const claimed = runEvidence([
			'record',
			...common,
			'--gate',
			'authored-source-types',
			'--status',
			'passed',
			'--command',
			'pnpm typecheck',
			'--observed',
			'claimed pass',
		]);
		assert.equal(claimed.status, 2);
		assert.match(claimed.stderr, /cannot claim command evidence/i);

		const artifactPath = path.join(workRoot, 'artifact-only.json');
		writeFileSync(artifactPath, '{}\n');
		const artifactOnly = runEvidence([
			'record',
			...common,
			'--gate',
			'packed-source-types-browser',
			'--status',
			'passed',
			'--artifact',
			artifactPath,
			'--observed',
			'passed',
		]);
		assert.equal(artifactOnly.status, 2);
		assert.match(artifactOnly.stderr, /command-backed.*use run/i);
	});

	test('rejects worktree collisions and symlinked binding paths before implementation', () => {
		const collision = createReadyBatch();
		mkdirSync(path.join(collision.workspaceRoot, 'packages/widget'), { recursive: true });
		writeFileSync(path.join(collision.workspaceRoot, 'packages/widget/package.json'), '{}\n');
		const collisionResult = runEvidence([
			'init',
			'--work-root',
			collision.workRoot,
			'--batch',
			'fixture-batch',
			'--node',
			'pkg:widget',
			'--category',
			'thin-core',
		]);
		assert.equal(collisionResult.status, 2);
		assert.match(collisionResult.stderr, /worktree collision.*packages\/widget/i);

		const committedCollision = createReadyBatch();
		mkdirSync(path.join(committedCollision.workspaceRoot, 'packages/widget'), {
			recursive: true,
		});
		writeFileSync(
			path.join(committedCollision.workspaceRoot, 'packages/widget/package.json'),
			'{}\n',
		);
		assert.equal(
			spawnSync('git', ['add', 'packages/widget/package.json'], {
				cwd: committedCollision.workspaceRoot,
			}).status,
			0,
		);
		assert.equal(
			spawnSync(
				'git',
				[
					'-c',
					'user.name=Fixture',
					'-c',
					'user.email=fixture@example.com',
					'commit',
					'--quiet',
					'-m',
					'occupy planned path',
				],
				{ cwd: committedCollision.workspaceRoot },
			).status,
			0,
		);
		const committedCollisionResult = runEvidence([
			'init',
			'--work-root',
			committedCollision.workRoot,
			'--batch',
			'fixture-batch',
			'--node',
			'pkg:widget',
			'--category',
			'thin-core',
		]);
		assert.equal(committedCollisionResult.status, 2);
		assert.match(committedCollisionResult.stderr, /worktree collision.*packages\/widget/i);

		const symlinked = createReadyBatch();
		const outside = mkdtempSync(path.join(tmpdir(), 'react-port-outside-binding-'));
		mkdirSync(path.join(symlinked.workspaceRoot, 'packages'), { recursive: true });
		symlinkSync(outside, path.join(symlinked.workspaceRoot, 'packages/widget'));
		const symlinkManifestPath = path.join(symlinked.batchDirectory, 'manifest.json');
		const symlinkManifest = JSON.parse(readFileSync(symlinkManifestPath, 'utf8'));
		symlinkManifest.baseline['packages/widget'] = `symlink:${outside}`;
		writeFileSync(symlinkManifestPath, `${JSON.stringify(symlinkManifest, null, 2)}\n`);
		const symlinkResult = runEvidence([
			'init',
			'--work-root',
			symlinked.workRoot,
			'--batch',
			'fixture-batch',
			'--node',
			'pkg:widget',
			'--category',
			'thin-core',
		]);
		assert.equal(symlinkResult.status, 2);
		assert.match(symlinkResult.stderr, /symlink.*packages\/widget/i);
	});

	test('passes shell metacharacters as literal argv data', () => {
		const { workspaceRoot, workRoot, batchDirectory } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		createCompletePackage(workspaceRoot);
		const literal = '$(printf injected); && | >';
		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'authored-source-types',
				'--',
				'pnpm',
				'exec',
				'tsrx-tsc',
				'--noEmit',
				'-p',
				'packages/widget/tsconfig.json',
			],
			{ env: { FIXTURE_STDOUT: literal } },
		);

		assert.equal(result.status, 0, result.stderr);
		const manifest = JSON.parse(readFileSync(path.join(batchDirectory, 'manifest.json'), 'utf8'));
		assert.equal(
			manifest.nodes['pkg:widget'].evidenceMatrix.gates['authored-source-types'].observed,
			literal,
		);
	});

	test('redacts configured npm credentials from command reports and stored evidence', () => {
		const { workspaceRoot, workRoot, batchDirectory } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		createCompletePackage(workspaceRoot);
		const token = 'npm_abcdefghijklmnopqrstuvwxyz0123456789';
		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'package-tests',
				'--',
				'pnpm',
				'--dir',
				'packages/widget',
				'test',
			],
			{ env: { NPM_TOKEN: token, NODE_AUTH_TOKEN: token, FIXTURE_PRINT_NPM_TOKEN: '1' } },
		);

		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout.includes(token), false);
		assert.equal(
			readFileSync(path.join(batchDirectory, 'manifest.json'), 'utf8').includes(token),
			false,
		);
		assert.match(result.stdout, /\[REDACTED\]/);
	});

	test('executes one command once for multiple evidence gates', () => {
		const { workspaceRoot, workRoot, batchDirectory } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		createCompletePackage(workspaceRoot);
		const counterPath = path.join(workspaceRoot, 'type-command-count');

		const result = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'packed-source-types-node',
				'--gate',
				'packed-source-types-browser',
				'--gate',
				'packed-source-types-node',
				'--',
				'pnpm',
				'packages:pack:check',
			],
			{ env: { FIXTURE_COUNTER: counterPath, FIXTURE_STDOUT: 'both packed projects passed' } },
		);

		assert.equal(result.status, 0, result.stderr);
		assert.equal(readFileSync(counterPath, 'utf8'), 'x');
		const manifest = JSON.parse(readFileSync(path.join(batchDirectory, 'manifest.json'), 'utf8'));
		const resultReport = JSON.parse(result.stdout);
		assert.equal(resultReport.gates.length, 2);
		for (const gateId of ['packed-source-types-node', 'packed-source-types-browser']) {
			assert.equal(manifest.nodes['pkg:widget'].evidenceMatrix.gates[gateId].status, 'passed');
			assert.match(
				manifest.nodes['pkg:widget'].evidenceMatrix.gates[gateId].observed,
				/both packed projects passed/,
			);
		}

		const failed = runEvidence(
			[
				'run',
				...common,
				'--gate',
				'upstream-types-adapted',
				'--',
				'pnpm',
				'exec',
				'tsrx-tsc',
				'--noEmit',
				'-p',
				'packages/widget/tests/types/upstream/tsconfig.adapted.json',
			],
			{
				env: {
					FIXTURE_COUNTER: counterPath,
					FIXTURE_COUNTER_VALUE: 'y',
					FIXTURE_STDERR: 'type projects failed',
					FIXTURE_EXIT: '3',
				},
			},
		);

		assert.equal(failed.status, 2);
		assert.equal(readFileSync(counterPath, 'utf8'), 'xy');
		const failedManifest = JSON.parse(
			readFileSync(path.join(batchDirectory, 'manifest.json'), 'utf8'),
		);
		for (const gateId of ['upstream-types-adapted']) {
			assert.equal(
				failedManifest.nodes['pkg:widget'].evidenceMatrix.gates[gateId].status,
				'failed',
			);
			assert.match(
				failedManifest.nodes['pkg:widget'].evidenceMatrix.gates[gateId].observed,
				/type projects failed/,
			);
		}
	});

	test('rejects invalid multi-gate requests before executing or mutating evidence', () => {
		const { workspaceRoot, workRoot, batchDirectory } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);

		const recorded = runEvidence([
			'record',
			...common,
			'--gate',
			'upstream-types-pristine',
			'--gate',
			'upstream-types-adapted',
			'--status',
			'blocked',
			'--reason',
			'fixture reason',
			'--repair',
			'fixture repair',
		]);
		assert.equal(recorded.status, 2);
		assert.match(recorded.stderr, /exactly one --gate/i);

		const counterPath = path.join(workspaceRoot, 'invalid-gate-command-count');
		const run = runEvidence([
			'run',
			...common,
			'--gate',
			'authored-source-types',
			'--gate',
			'unknown-types',
			'--',
			process.execPath,
			'-e',
			`require('node:fs').appendFileSync(${JSON.stringify(counterPath)}, 'x')`,
		]);
		assert.equal(run.status, 2);
		assert.match(run.stderr, /unknown evidence gate/i);
		assert.equal(existsSync(counterPath), false);

		const manifest = JSON.parse(readFileSync(path.join(batchDirectory, 'manifest.json'), 'utf8'));
		for (const gateId of [
			'upstream-types-pristine',
			'upstream-types-adapted',
			'public-types',
			'authored-source-types',
		]) {
			assert.equal(manifest.nodes['pkg:widget'].evidenceMatrix.gates[gateId].status, 'required');
		}
	});

	test('resets a stale implementing matrix only through matching init categories', () => {
		const { workspaceRoot, workRoot, batchDirectory } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const manifestPath = path.join(batchDirectory, 'manifest.json');
		const legacyManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		legacyManifest.nodes['pkg:widget'].evidenceMatrix = {
			schemaVersion: 1,
			categories: ['thin-core'],
			gates: {
				typecheck: {
					id: 'typecheck',
					status: 'passed',
					allowInapplicable: false,
					artifact: 'legacy-types.log',
					observed: 'Legacy typecheck passed.',
				},
			},
		};
		legacyManifest.nodes['pkg:widget'].evidence = { readiness: { status: 'verified' } };
		writeFileSync(manifestPath, `${JSON.stringify(legacyManifest, null, 2)}\n`);

		const counterPath = path.join(workspaceRoot, 'stale-matrix-command-count');
		const run = runEvidence([
			'run',
			...common,
			'--gate',
			'authored-source-types',
			'--',
			process.execPath,
			'-e',
			`require('node:fs').appendFileSync(${JSON.stringify(counterPath)}, 'x')`,
		]);
		assert.equal(run.status, 2);
		assert.match(run.stderr, /rerun init/i);
		assert.equal(existsSync(counterPath), false);

		const recorded = runEvidence([
			'record',
			...common,
			'--gate',
			'typecheck',
			'--status',
			'blocked',
			'--reason',
			'legacy evidence',
			'--repair',
			'reset evidence',
		]);
		assert.equal(recorded.status, 2);
		assert.match(recorded.stderr, /rerun init/i);
		const verified = runEvidence(['verify', ...common]);
		assert.equal(verified.status, 2);
		assert.match(verified.stderr, /rerun init/i);

		const mismatched = runEvidence(['init', ...common, '--category', 'hooks-store']);
		assert.equal(mismatched.status, 2);
		assert.match(mismatched.stderr, /different evidence category/i);
		assert.equal(
			JSON.parse(readFileSync(manifestPath, 'utf8')).nodes['pkg:widget'].evidenceMatrix
				.schemaVersion,
			1,
		);

		const reset = runEvidence(['init', ...common, '--category', 'thin-core']);
		assert.equal(reset.status, 0, reset.stderr);
		const resetManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		const resetNode = resetManifest.nodes['pkg:widget'];
		assert.equal(resetNode.evidenceMatrix.schemaVersion, EVIDENCE_MATRIX_SCHEMA_VERSION);
		assert.equal(resetNode.evidenceMatrix.gates.typecheck, undefined);
		assert.equal(Object.hasOwn(resetNode, 'evidence'), false);
		for (const gateId of [
			'upstream-types-pristine',
			'upstream-types-adapted',
			'authored-source-types',
			'public-types',
			'packed-source-types-node',
			'packed-source-types-browser',
		]) {
			assert.equal(resetNode.evidenceMatrix.gates[gateId].status, 'required');
		}
	});

	test('refuses verification while required evidence is missing', () => {
		const { workspaceRoot, workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);

		const inputRoot = mkdtempSync(path.join(tmpdir(), 'react-port-evidence-input-'));
		for (const [name, value] of Object.entries({
			'registrations.json': [],
			'crosswalk.json': [],
			'closure.json': { runtimeDependencies: [], adaptedSources: [] },
		})) {
			writeFileSync(path.join(inputRoot, name), JSON.stringify(value));
		}
		const verified = runEvidence([
			'verify',
			...common,
			'--package-dir',
			path.join(workspaceRoot, 'packages/widget'),
			'--expected-directory',
			'packages/widget',
			'--registrations',
			path.join(inputRoot, 'registrations.json'),
			'--crosswalk',
			path.join(inputRoot, 'crosswalk.json'),
			'--closure',
			path.join(inputRoot, 'closure.json'),
		]);

		assert.equal(verified.status, 2);
		const report = JSON.parse(verified.stdout);
		assert.equal(report.status, 'blocked');
		assert.ok(report.issues.some((issue) => issue.includes('package-tests')));
	});

	test('enforces clean-room dependency proof from the closure artifact during verification', () => {
		const { workspaceRoot, workRoot } = createReadyBatch({ cleanRoomDependency: true });
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);

		const inputRoot = mkdtempSync(path.join(tmpdir(), 'react-port-clean-room-closure-'));
		for (const [name, value] of Object.entries({
			'registrations.json': [],
			'crosswalk.json': [],
			'closure.json': {
				runtimeDependencies: [],
				adaptedSources: [],
				reimplementedDependencies: [],
			},
		})) {
			writeFileSync(path.join(inputRoot, name), JSON.stringify(value));
		}
		const verified = runEvidence([
			'verify',
			...common,
			'--package-dir',
			path.join(workspaceRoot, 'packages/widget'),
			'--expected-directory',
			'packages/widget',
			'--registrations',
			path.join(inputRoot, 'registrations.json'),
			'--crosswalk',
			path.join(inputRoot, 'crosswalk.json'),
			'--closure',
			path.join(inputRoot, 'closure.json'),
		]);

		assert.equal(verified.status, 2);
		const report = JSON.parse(verified.stdout);
		assert.equal(report.closureReport.status, 'blocked');
		assert.match(report.closureReport.issues.join('\n'), /react-helper.*clean-room.*proof/i);
	});

	test('refuses verification outside the graph-planned binding directory', () => {
		const { workRoot } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		const inputRoot = mkdtempSync(path.join(tmpdir(), 'react-port-evidence-directory-'));
		for (const [name, value] of Object.entries({
			'registrations.json': [],
			'crosswalk.json': [],
			'closure.json': { runtimeDependencies: [], adaptedSources: [] },
		})) {
			writeFileSync(path.join(inputRoot, name), JSON.stringify(value));
		}

		const verified = runEvidence([
			'verify',
			...common,
			'--package-dir',
			path.join(inputRoot, 'package'),
			'--expected-directory',
			'packages/react-widget',
			'--registrations',
			path.join(inputRoot, 'registrations.json'),
			'--crosswalk',
			path.join(inputRoot, 'crosswalk.json'),
			'--closure',
			path.join(inputRoot, 'closure.json'),
		]);

		assert.equal(verified.status, 2);
		assert.match(verified.stderr, /graph plan: packages\/widget/i);
	});

	test('refuses a conforming package outside the planned workspace directory', () => {
		const { workRoot, batchDirectory } = createReadyBatch();
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		recordRequiredEvidence(batchDirectory);

		const inputRoot = mkdtempSync(path.join(tmpdir(), 'react-port-evidence-outside-'));
		const packageDirectory = createCompletePackage(inputRoot);
		for (const [name, value] of Object.entries({
			'registrations.json': [],
			'crosswalk.json': [],
			'closure.json': completeClosure(packageDirectory),
		})) {
			writeFileSync(path.join(inputRoot, name), JSON.stringify(value));
		}
		const verified = runEvidence([
			'verify',
			...common,
			'--package-dir',
			packageDirectory,
			'--expected-directory',
			'packages/widget',
			'--registrations',
			path.join(inputRoot, 'registrations.json'),
			'--crosswalk',
			path.join(inputRoot, 'crosswalk.json'),
			'--closure',
			path.join(inputRoot, 'closure.json'),
		]);

		assert.equal(verified.status, 2);
		assert.match(verified.stderr, /planned workspace directory/i);
	});

	test('drives production command validation through verify and terminal', () => {
		const { workspaceRoot, workRoot, batchDirectory } = createReadyBatch();
		mkdirSync(path.join(workspaceRoot, 'scripts/react-port'), { recursive: true });
		symlinkSync(
			path.join(SCRIPT_DIRECTORY, 'public-exports.mjs'),
			path.join(workspaceRoot, 'scripts/react-port/public-exports.mjs'),
		);
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);

		const inputRoot = mkdtempSync(path.join(tmpdir(), 'react-port-evidence-success-'));
		const packageDirectory = createCompletePackage(workspaceRoot);
		for (const [gateId, commandArguments] of [
			['package-tests', ['pnpm', '--dir', 'packages/widget', 'test']],
			[
				'public-exports',
				['node', 'scripts/react-port/public-exports.mjs', '--package-dir', 'packages/widget'],
			],
			[
				'upstream-types-pristine',
				[
					'pnpm',
					'exec',
					'tsc',
					'--noEmit',
					'-p',
					'packages/widget/tests/types/upstream/tsconfig.pristine.json',
				],
			],
			[
				'upstream-types-adapted',
				[
					'pnpm',
					'exec',
					'tsrx-tsc',
					'--noEmit',
					'-p',
					'packages/widget/tests/types/upstream/tsconfig.adapted.json',
				],
			],
			[
				'authored-source-types',
				['pnpm', 'exec', 'tsrx-tsc', '--noEmit', '-p', 'packages/widget/tsconfig.json'],
			],
			[
				'public-types',
				[
					'pnpm',
					'exec',
					'tsrx-tsc',
					'--noEmit',
					'-p',
					'packages/widget/tests/types/public/tsconfig.json',
				],
			],
		]) {
			const gate = runEvidence(['run', ...common, '--gate', gateId, '--', ...commandArguments]);
			assert.equal(gate.status, 0, `${gateId}: ${gate.stderr || gate.stdout}`);
		}
		recordRequiredEvidence(batchDirectory);
		for (const [name, value] of Object.entries({
			'registrations.json': [],
			'crosswalk.json': [],
			'closure.json': completeClosure(packageDirectory),
		})) {
			writeFileSync(path.join(inputRoot, name), JSON.stringify(value));
		}
		const verified = runEvidence([
			'verify',
			...common,
			'--package-dir',
			packageDirectory,
			'--expected-directory',
			'packages/widget',
			'--registrations',
			path.join(inputRoot, 'registrations.json'),
			'--crosswalk',
			path.join(inputRoot, 'crosswalk.json'),
			'--closure',
			path.join(inputRoot, 'closure.json'),
		]);

		assert.equal(verified.status, 0, verified.stderr);
		const report = JSON.parse(verified.stdout);
		assert.equal(report.status, 'passed');
		assert.equal(report.state, 'verified');
		const terminal = spawnSync(
			process.execPath,
			[
				path.join(SCRIPT_DIRECTORY, 'terminal.mjs'),
				'--work-root',
				workRoot,
				'--batch',
				'fixture-batch',
			],
			{ cwd: workspaceRoot, encoding: 'utf8' },
		);
		assert.equal(terminal.status, 0, terminal.stderr || terminal.stdout);
		assert.equal(JSON.parse(terminal.stdout).status, 'terminal');
	});

	test('uses the recorded workspace with a nested custom work root', () => {
		const { workspaceRoot, workRoot, batchDirectory } = createReadyBatch({
			workRootPath: 'state/react-port',
		});
		const common = ['--work-root', workRoot, '--batch', 'fixture-batch', '--node', 'pkg:widget'];
		assert.equal(runEvidence(['init', ...common, '--category', 'thin-core']).status, 0);
		recordRequiredEvidence(batchDirectory);

		const inputRoot = mkdtempSync(path.join(tmpdir(), 'react-port-evidence-custom-root-'));
		const packageDirectory = createCompletePackage(workspaceRoot);
		for (const [name, value] of Object.entries({
			'registrations.json': [],
			'crosswalk.json': [],
			'closure.json': completeClosure(packageDirectory),
		})) {
			writeFileSync(path.join(inputRoot, name), JSON.stringify(value));
		}
		const verified = runEvidence([
			'verify',
			...common,
			'--package-dir',
			packageDirectory,
			'--expected-directory',
			'packages/widget',
			'--registrations',
			path.join(inputRoot, 'registrations.json'),
			'--crosswalk',
			path.join(inputRoot, 'crosswalk.json'),
			'--closure',
			path.join(inputRoot, 'closure.json'),
		]);

		assert.equal(verified.status, 0, verified.stderr);
		const manifest = JSON.parse(readFileSync(path.join(batchDirectory, 'manifest.json'), 'utf8'));
		assert.equal(
			manifest.nodes['pkg:widget'].evidenceMatrix.gates['identity-license'].artifact,
			path.join(workRoot, 'fixture-batch', 'manifest.json'),
		);
	});
});
