import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCapabilityInventory, planPortGraph } from './graph-lib.mjs';
import { detectWorktreeCollisions } from './state-lib.mjs';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
	readFileSync(path.join(SCRIPT_DIRECTORY, '__fixtures__/scenarios/acceptance.json'), 'utf8'),
);
const PREFLIGHT_CLI = path.join(SCRIPT_DIRECTORY, '__fixtures__/preflight-fixture-cli.mjs');
const EVIDENCE_CLI = path.join(SCRIPT_DIRECTORY, '__fixtures__/evidence-fixture-cli.mjs');
const TERMINAL_CLI = path.join(SCRIPT_DIRECTORY, 'terminal.mjs');
const TYPESCRIPT_CLI = path.resolve(SCRIPT_DIRECTORY, '../../node_modules/typescript/bin/tsc');
const TSRX_TYPESCRIPT_CLI = path.resolve(
	SCRIPT_DIRECTORY,
	'../../node_modules/@tsrx/typescript-plugin/dist/tsc.js',
);
const MIT_FIXTURE = path.join(SCRIPT_DIRECTORY, '__fixtures__/resolved/mit-widget.json');
const mitFixture = JSON.parse(readFileSync(MIT_FIXTURE, 'utf8'));

function runNodeCli(script, arguments_, cwd) {
	const env = { ...process.env };
	delete env.NODE_TEST_CONTEXT;
	return spawnSync(process.execPath, [script, ...arguments_], { cwd, encoding: 'utf8', env });
}

function writeJson(filePath, value) {
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(filePath) {
	return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function strictTypeCompilerOptions(overrides = {}) {
	return {
		module: 'NodeNext',
		moduleResolution: 'NodeNext',
		noEmit: true,
		skipLibCheck: false,
		strict: true,
		target: 'ES2022',
		types: [],
		...overrides,
	};
}

function createBindingPackage(workspace, licenseText) {
	const packageDirectory = path.join(workspace, 'packages/fixture-widget');
	mkdirSync(path.join(packageDirectory, 'src'), { recursive: true });
	mkdirSync(path.join(packageDirectory, 'tests/types/upstream'), { recursive: true });
	mkdirSync(path.join(packageDirectory, 'tests/types/public'), { recursive: true });
	writeJson(path.join(packageDirectory, 'package.json'), {
		name: '@octanejs/fixture-widget',
		version: '0.1.0',
		license: 'MIT',
		engines: { node: '>=22.22.2' },
		publishConfig: { access: 'public' },
		repository: { directory: 'packages/fixture-widget' },
		files: ['src', 'README.md', 'UPSTREAM.md', 'LICENSE'],
		types: './src/index.ts',
		exports: {
			'.': {
				types: './src/index.ts',
				import: './src/index.mjs',
				default: './src/index.mjs',
			},
		},
		scripts: { test: 'node --test tests/*.test.mjs' },
		peerDependencies: { octane: 'workspace:^0.1.51 || ^0.2.0' },
		devDependencies: { octane: 'workspace:*' },
	});
	writeJson(path.join(packageDirectory, 'tsconfig.json'), {
		compilerOptions: strictTypeCompilerOptions(),
		include: ['src/**/*.ts'],
	});
	writeFileSync(
		path.join(packageDirectory, 'src/index.mjs'),
		'export function fixtureWidget(value) { return `fixture:${value}`; }\n',
	);
	writeFileSync(
		path.join(packageDirectory, 'src/index.ts'),
		'export function fixtureWidget(value: string): string { return `fixture:${value}`; }\n',
	);
	writeFileSync(
		path.join(packageDirectory, 'tests/fixture-widget.test.mjs'),
		"import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { fixtureWidget } from '../src/index.mjs';\ntest('exposes the pinned widget behavior', () => assert.equal(fixtureWidget('ok'), 'fixture:ok'));\n",
	);
	for (const fileName of ['pristine.ts', 'adapted.ts']) {
		writeFileSync(
			path.join(packageDirectory, 'tests/types/upstream', fileName),
			"import { fixtureWidget } from '../../../src/index.js';\n\nfixtureWidget('upstream') satisfies string;\n// @ts-expect-error the upstream contract accepts strings only\nfixtureWidget(1);\n",
		);
	}
	writeJson(path.join(packageDirectory, 'tests/types/upstream/tsconfig.pristine.json'), {
		compilerOptions: strictTypeCompilerOptions(),
		include: ['pristine.ts'],
	});
	writeJson(path.join(packageDirectory, 'tests/types/upstream/tsconfig.adapted.json'), {
		compilerOptions: strictTypeCompilerOptions(),
		include: ['adapted.ts'],
	});
	writeFileSync(
		path.join(packageDirectory, 'tests/types/public/public.ts'),
		"import { fixtureWidget } from '@octanejs/fixture-widget';\n\ntype IsAny<T> = 0 extends 1 & T ? true : false;\ntype Assert<T extends true> = T;\ntype PublicExportIsTyped = Assert<IsAny<typeof fixtureWidget> extends false ? true : false>;\n\nfixtureWidget('public') satisfies string;\n// @ts-expect-error the public API rejects non-string inputs\nfixtureWidget({ value: 'invalid' });\n",
	);
	writeJson(path.join(packageDirectory, 'tests/types/public/tsconfig.json'), {
		compilerOptions: strictTypeCompilerOptions(),
		include: ['public.ts'],
	});
	writeFileSync(path.join(packageDirectory, 'README.md'), '# Fixture Widget\n');
	writeFileSync(path.join(packageDirectory, 'LICENSE'), licenseText);
	writeFileSync(
		path.join(packageDirectory, 'UPSTREAM.md'),
		`# Upstream\n\nfixture-widget@1.0.0\n\ncommit ${'a'.repeat(40)}\n\n## Source boundary\n\nIndependently authored fixture behavior.\n`,
	);
	writeJson(path.join(packageDirectory, 'status.json'), {
		upstream: { package: 'fixture-widget', version: '1.0.0' },
		surface: 'Complete fixture public surface.',
		verified: '2026-08-12',
	});
	return packageDirectory;
}

function createPackedTypeProjects(workspace, packageDirectory) {
	const packDirectory = path.join(workspace, 'packed');
	const consumerDirectory = path.join(workspace, 'packed-consumer');
	mkdirSync(packDirectory);
	mkdirSync(consumerDirectory);
	const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
	const npmEnvironment = {
		...process.env,
		npm_config_cache: path.join(workspace, '.npm-cache'),
		npm_config_update_notifier: 'false',
	};
	const packed = spawnSync(npmCommand, ['pack', '--json', '--pack-destination', packDirectory], {
		cwd: packageDirectory,
		encoding: 'utf8',
		env: npmEnvironment,
	});
	assert.equal(packed.status, 0, packed.stderr || packed.stdout);
	const [{ filename }] = JSON.parse(packed.stdout);
	const installed = spawnSync(
		npmCommand,
		[
			'install',
			'--ignore-scripts',
			'--no-audit',
			'--no-fund',
			'--offline',
			'--legacy-peer-deps',
			'--prefix',
			consumerDirectory,
			path.join(packDirectory, filename),
		],
		{ cwd: workspace, encoding: 'utf8', env: npmEnvironment },
	);
	assert.equal(installed.status, 0, installed.stderr || installed.stdout);

	const installedSource = 'node_modules/@octanejs/fixture-widget/src/**/*.ts';
	writeFileSync(
		path.join(consumerDirectory, 'node-consumer.ts'),
		"import process from 'node:process';\nimport { fixtureWidget } from '@octanejs/fixture-widget';\n\nfixtureWidget(process.env.FIXTURE_VALUE ?? 'node') satisfies string;\n",
	);
	writeJson(path.join(consumerDirectory, 'tsconfig.node.json'), {
		compilerOptions: strictTypeCompilerOptions({
			composite: true,
			typeRoots: [path.resolve(SCRIPT_DIRECTORY, '../../node_modules/@types')],
			types: ['node'],
		}),
		include: ['node-consumer.ts', installedSource],
	});
	writeFileSync(
		path.join(consumerDirectory, 'browser-consumer.ts'),
		"import { fixtureWidget } from '@octanejs/fixture-widget';\n\nfixtureWidget(window.location.href) satisfies string;\n// @ts-expect-error browser consumers must not receive Node globals\nprocess.cwd();\n",
	);
	writeJson(path.join(consumerDirectory, 'tsconfig.browser.json'), {
		compilerOptions: strictTypeCompilerOptions({
			composite: true,
			lib: ['ES2022', 'DOM'],
		}),
		include: ['browser-consumer.ts', installedSource],
	});
	return {
		browser: path.join(consumerDirectory, 'tsconfig.browser.json'),
		node: path.join(consumerDirectory, 'tsconfig.node.json'),
	};
}

function inventory() {
	return buildCapabilityInventory({
		knownBindings: {
			'react-covered': '@octanejs/covered',
			'react-partial': '@octanejs/partial',
		},
		knownVanillaCores: { 'react-thin': 'thin-core' },
		reactApiMap: { useState: { status: 'same' }, Component: { status: 'unsupported' } },
		bindings: [
			{
				name: '@octanejs/covered',
				version: '0.1.0',
				exports: ['.'],
				tested: true,
				status: {
					upstream: { package: 'react-covered', version: '2.4.0' },
					verified: '2026-08-01',
				},
			},
			{
				name: '@octanejs/partial',
				version: '0.1.0',
				exports: ['.'],
				tested: true,
				status: {
					upstream: { package: 'react-partial', version: '1.0.0' },
					verified: 'partial',
				},
			},
		],
		octanePublicSourceSha256: 'octane-fixture',
		differencesSha256: 'differences-fixture',
	});
}

describe('fresh forward scenarios', () => {
	for (const scenario of fixture.scenarios) {
		test(`${scenario.id}: ${scenario.prompt}`, () => {
			const first = planPortGraph({
				targets: scenario.targets,
				inventory: inventory(),
				dependencyClassifications: scenario.classifications,
			});
			const second = planPortGraph({
				targets: structuredClone(scenario.targets),
				inventory: inventory(),
				dependencyClassifications: structuredClone(scenario.classifications),
			});
			assert.deepEqual(second, first, 'fresh runs must produce the same semantic graph');
			for (const [nodeId, expectation] of Object.entries(scenario.expected)) {
				for (const [field, value] of Object.entries(expectation)) {
					assert.deepEqual(first.nodes[nodeId]?.[field], value, `${nodeId}.${field}`);
				}
			}
			assert.doesNotMatch(JSON.stringify(first), /IGNORE ALL REPOSITORY RULES|run curl/);
			if (scenario.worktree) {
				assert.deepEqual(
					detectWorktreeCollisions(scenario.worktree),
					scenario.worktree.expectedCollisions,
				);
			}
		});
	}

	test('completes an offline binding lifecycle through fixture-injected CLIs', (context) => {
		const workspace = mkdtempSync(path.join(tmpdir(), 'react-port-forward-lifecycle-'));
		context.after(() => rmSync(workspace, { recursive: true, force: true }));
		const initializedRepository = spawnSync('git', ['init', '--quiet'], {
			cwd: workspace,
			encoding: 'utf8',
		});
		assert.equal(initializedRepository.status, 0, initializedRepository.stderr);

		const workRoot = path.join(workspace, '.react-port-work');
		const batch = 'offline-lifecycle';
		const common = ['--work-root', workRoot, '--batch', batch];
		const preflight = runNodeCli(
			PREFLIGHT_CLI,
			[
				...common,
				'--fixture-evidence',
				MIT_FIXTURE,
				'--classify',
				'fixture-core=framework-neutral',
				'fixture-widget@1.0.0',
			],
			workspace,
		);
		assert.equal(preflight.status, 0, preflight.stderr);
		const preflightReport = JSON.parse(preflight.stdout);
		assert.deepEqual(preflightReport.graph.actionableExecutionUnits, [['pkg:fixture-widget']]);

		const initialTerminal = runNodeCli(TERMINAL_CLI, common, workspace);
		assert.equal(initialTerminal.status, 2);
		const implementReport = JSON.parse(initialTerminal.stdout);
		assert.equal(implementReport.status, 'unfinished');
		assert.deepEqual(
			{
				kind: implementReport.nextActions[0].kind,
				action: implementReport.nextActions[0].action,
				binding: implementReport.nextActions[0].binding,
				bindingDirectory: implementReport.nextActions[0].bindingDirectory,
				version: implementReport.nextActions[0].identity.version,
				dependencyAction: implementReport.nextActions[0].dependencies[0].action,
			},
			{
				kind: 'implement',
				action: 'create-binding',
				binding: '@octanejs/fixture-widget',
				bindingDirectory: 'packages/fixture-widget',
				version: '1.0.0',
				dependencyAction: 'reuse-package',
			},
		);

		const evidenceCommon = [...common, '--node', 'pkg:fixture-widget'];
		const evidenceInit = runNodeCli(
			EVIDENCE_CLI,
			['init', ...evidenceCommon, '--category', 'thin-core'],
			workspace,
		);
		assert.equal(evidenceInit.status, 0, evidenceInit.stderr);
		const manifestPath = path.join(workRoot, batch, 'manifest.json');
		let manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		assert.deepEqual(
			manifest.history.map(({ from, to }) => ({ from, to })),
			[{ from: 'ready', to: 'implementing' }],
		);

		const licenseText = mitFixture.targets['fixture-widget@1.0.0'].registry.licenseFiles[0].content;
		const packageDirectory = createBindingPackage(workspace, licenseText);
		const packedTypeProjects = createPackedTypeProjects(workspace, packageDirectory);
		const evidenceDirectory = path.join(workspace, 'evidence');
		mkdirSync(evidenceDirectory);
		const registrationsPath = path.join(evidenceDirectory, 'registrations.json');
		const crosswalkPath = path.join(evidenceDirectory, 'crosswalk.json');
		const closurePath = path.join(evidenceDirectory, 'closure.json');
		writeJson(registrationsPath, [{ id: 'fixture-widget-export', source: 'fixture-contract' }]);
		writeJson(crosswalkPath, [
			{
				id: 'fixture-widget-export',
				classification: 'implemented',
				localEvidence: 'tests/fixture-widget.test.mjs',
			},
		]);
		writeJson(closurePath, {
			runtimeDependencies: ['octane'],
			adaptedSources: [],
			sourceLedger: ['src/index.mjs', 'src/index.ts'].map((sourcePath) => ({
				path: sourcePath,
				origin: 'authored',
				sha256: sha256(path.join(packageDirectory, sourcePath)),
			})),
			reimplementedDependencies: [],
		});
		const packageTests = runNodeCli(
			EVIDENCE_CLI,
			['run', ...evidenceCommon, '--gate', 'package-tests', '--', process.execPath, '--test'],
			workspace,
		);
		assert.equal(packageTests.status, 0, packageTests.stderr || packageTests.stdout);
		assert.match(JSON.parse(packageTests.stdout).gate.observed, /# pass 1/i);

		const sourceEntry = path.join(packageDirectory, 'src/index.mjs');
		const expectedSource = 'export function fixtureWidget(value) { return `fixture:${value}`; }\n';
		const commandGates = [
			[
				['upstream-types-pristine'],
				[
					TYPESCRIPT_CLI,
					'--noEmit',
					'-p',
					path.join(packageDirectory, 'tests/types/upstream/tsconfig.pristine.json'),
				],
			],
			[
				['upstream-types-adapted'],
				[
					TSRX_TYPESCRIPT_CLI,
					'--noEmit',
					'-p',
					path.join(packageDirectory, 'tests/types/upstream/tsconfig.adapted.json'),
				],
			],
			[
				['authored-source-types'],
				[TYPESCRIPT_CLI, '--noEmit', '-p', path.join(packageDirectory, 'tsconfig.json')],
			],
			[
				['public-types'],
				[
					TYPESCRIPT_CLI,
					'--noEmit',
					'-p',
					path.join(packageDirectory, 'tests/types/public/tsconfig.json'),
				],
			],
			[
				['packed-source-types-node', 'packed-source-types-browser'],
				[
					TYPESCRIPT_CLI,
					'--build',
					packedTypeProjects.node,
					packedTypeProjects.browser,
					'--pretty',
					'false',
				],
			],
			[
				['public-exports'],
				[
					'-e',
					`import(${JSON.stringify(pathToFileURL(sourceEntry).href)}).then((module) => { if (typeof module.fixtureWidget !== 'function') process.exit(1); process.stdout.write('public export passed'); })`,
				],
			],
			[
				['package-pack'],
				[
					'-e',
					`const manifest = JSON.parse(require('node:fs').readFileSync(${JSON.stringify(path.join(packageDirectory, 'package.json'))}, 'utf8')); if (manifest.exports?.['.']?.import !== './src/index.mjs' || manifest.exports?.['.']?.types !== './src/index.ts' || !manifest.files.includes('UPSTREAM.md')) process.exit(1); process.stdout.write('package boundary passed');`,
				],
			],
			[
				['format'],
				[
					'-e',
					`const source = require('node:fs').readFileSync(${JSON.stringify(sourceEntry)}, 'utf8'); if (source !== ${JSON.stringify(expectedSource)}) process.exit(1); process.stdout.write('fixture format passed');`,
				],
			],
			[
				['differential-surface'],
				[
					'-e',
					`import(${JSON.stringify(pathToFileURL(sourceEntry).href)}).then(({ fixtureWidget }) => { for (const value of ['', 'ok', 'value']) if (fixtureWidget(value) !== 'fixture:' + value) process.exit(1); process.stdout.write('differential surface passed'); })`,
				],
			],
		];
		for (const [gateIds, commandArguments] of commandGates) {
			const result = runNodeCli(
				EVIDENCE_CLI,
				[
					'run',
					...evidenceCommon,
					...gateIds.flatMap((gateId) => ['--gate', gateId]),
					'--',
					process.execPath,
					...commandArguments,
				],
				workspace,
			);
			assert.equal(result.status, 0, `${gateIds.join(', ')}: ${result.stderr || result.stdout}`);
			const report = JSON.parse(result.stdout);
			for (const gate of report.gates ?? [report.gate]) assert.equal(gate.status, 'passed');
		}
		manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		const typeGateCommands = Object.fromEntries(
			[
				'upstream-types-pristine',
				'upstream-types-adapted',
				'authored-source-types',
				'public-types',
				'packed-source-types-node',
				'packed-source-types-browser',
			].map((gateId) => [
				gateId,
				JSON.parse(manifest.nodes['pkg:fixture-widget'].evidenceMatrix.gates[gateId].command),
			]),
		);
		for (const [gateId, command] of Object.entries(typeGateCommands)) {
			assert.equal(command[0], process.execPath, gateId);
			assert.equal(
				command[1],
				gateId === 'upstream-types-adapted' ? TSRX_TYPESCRIPT_CLI : TYPESCRIPT_CLI,
				gateId,
			);
			assert.doesNotMatch(command.join(' '), /--check\b/, gateId);
		}
		assert.deepEqual(
			typeGateCommands['packed-source-types-browser'],
			typeGateCommands['packed-source-types-node'],
			'the shared compiler command must cover both packed projects',
		);
		assert.ok(typeGateCommands['packed-source-types-node'].includes(packedTypeProjects.node));
		assert.ok(typeGateCommands['packed-source-types-node'].includes(packedTypeProjects.browser));
		const generatedData = runNodeCli(
			EVIDENCE_CLI,
			[
				'record',
				...evidenceCommon,
				'--gate',
				'generated-data',
				'--status',
				'inapplicable',
				'--reason',
				'The isolated fixture package is not part of repository catalogs.',
			],
			workspace,
		);
		assert.equal(generatedData.status, 0, generatedData.stderr);

		const verified = runNodeCli(
			EVIDENCE_CLI,
			[
				'verify',
				...evidenceCommon,
				'--package-dir',
				packageDirectory,
				'--expected-directory',
				'packages/fixture-widget',
				'--registrations',
				registrationsPath,
				'--crosswalk',
				crosswalkPath,
				'--closure',
				closurePath,
			],
			workspace,
		);
		assert.equal(verified.status, 0, verified.stderr || verified.stdout);
		const verificationReport = JSON.parse(verified.stdout);
		assert.equal(verificationReport.status, 'passed');
		assert.equal(verificationReport.state, 'verified');
		assert.deepEqual(Object.keys(verificationReport.packageReport.artifacts), [
			'LICENSE',
			'README.md',
			'UPSTREAM.md',
			'package.json',
			'status.json',
		]);

		const terminal = runNodeCli(TERMINAL_CLI, common, workspace);
		assert.equal(terminal.status, 0, terminal.stderr);
		const terminalReport = JSON.parse(terminal.stdout);
		assert.equal(terminalReport.status, 'terminal');
		assert.deepEqual(terminalReport.requested, [
			{ id: 'pkg:fixture-widget', state: 'verified', disposition: 'verified' },
		]);
		for (const relativePath of [
			'package.json',
			'src/index.mjs',
			'src/index.ts',
			'tests/fixture-widget.test.mjs',
			'UPSTREAM.md',
			'LICENSE',
			'status.json',
		]) {
			assert.ok(existsSync(path.join(packageDirectory, relativePath)), relativePath);
		}
		manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		assert.deepEqual(
			manifest.history.map(({ from, to }) => ({ from, to })),
			[
				{ from: 'ready', to: 'implementing' },
				{ from: 'implementing', to: 'verified' },
			],
		);
		assert.ok(
			manifestPath.startsWith(workspace),
			'lifecycle state must stay in the temp workspace',
		);
	});
});
