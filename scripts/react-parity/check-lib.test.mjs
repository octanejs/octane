import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';

import {
	buildHarnessArgv,
	buildParityVitestArgv,
	createRequiredNonVitestManifestShardPlan,
	estimateRequiredNonVitestManifestWeight,
	runRequiredNonVitestBindingLanes,
	runRequiredNonVitestBindingManifest,
	runRequiredVitestLanes,
} from './check-lib.mjs';
import ReactParityJsonReporter, { ensureStackContainsMessage } from './vitest-json-reporter.mjs';
import ReactParityUnhandledReporter from './vitest-unhandled-reporter.mjs';

const options = (relativeFiles, runManifest, concurrency = 2) => ({
	relativeFiles,
	harnessPath: '/repo/scripts/react-parity/harness.mjs',
	repo: '/repo',
	concurrency,
	runManifest,
});

function deferred() {
	let resolve;
	const promise = new Promise((resolvePromise) => (resolve = resolvePromise));
	return { promise, resolve };
}

async function waitFor(predicate) {
	for (let attempt = 0; attempt < 20; attempt++) {
		if (predicate()) return;
		await new Promise((resolve) => setImmediate(resolve));
	}
	throw new Error('condition was not reached');
}

test('builds a shell-free required-lane harness command', () => {
	assert.deepEqual(
		buildHarnessArgv(
			'/repo/scripts/react-parity/harness.mjs',
			'packages/example/audit/react-parity.json',
		),
		[
			'/repo/scripts/react-parity/harness.mjs',
			'run-required-non-vitest',
			'--manifest',
			'packages/example/audit/react-parity.json',
		],
	);
});

test('builds the parity-wide Vitest command', () => {
	assert.deepEqual(buildParityVitestArgv('vitest.react-parity.config.js'), [
		'node_modules/vitest/vitest.mjs',
		'run',
		'--config',
		'vitest.react-parity.config.js',
		'--reporter=./scripts/react-parity/vitest-json-reporter.mjs',
		'--reporter=./scripts/react-parity/vitest-unhandled-reporter.mjs',
	]);
	assert.deepEqual(buildParityVitestArgv('vitest.react-parity.config.js', '2/3'), [
		'node_modules/vitest/vitest.mjs',
		'run',
		'--config',
		'vitest.react-parity.config.js',
		'--reporter=./scripts/react-parity/vitest-json-reporter.mjs',
		'--reporter=./scripts/react-parity/vitest-unhandled-reporter.mjs',
		'--shard=2/3',
	]);
});

test('prints runner-level Vitest errors that the JSON reporter omits', () => {
	const messages = [];
	const originalError = console.error;
	console.error = (message) => messages.push(message);
	try {
		new ReactParityUnhandledReporter().onTestRunEnd(
			[],
			[{ stack: 'Error: worker failed\n    at worker.js:1:1' }],
		);
	} finally {
		console.error = originalError;
	}
	assert.deepEqual(messages, [
		'Vitest reported 1 unhandled error(s):',
		'Error: worker failed\n    at worker.js:1:1',
	]);
});

test('rebuilds timeout placeholder stacks around the real failure message', () => {
	const error = {
		name: 'Error',
		message: 'Test timed out in 5000ms.\nIf this is a long-running test, pass a timeout value.',
		stack: 'Error: STACK_TRACE_ERROR\n    at /repo/packages/example/example.test.ts:3:1',
	};
	ensureStackContainsMessage(error);
	assert.equal(
		error.stack,
		'Error: Test timed out in 5000ms.\nIf this is a long-running test, pass a timeout value.\n    at /repo/packages/example/example.test.ts:3:1',
	);

	const assertionStack = 'AssertionError: expected 1 to be 2\n    at example.test.ts:9:2';
	const untouched = {
		name: 'AssertionError',
		message: 'expected 1 to be 2',
		stack: assertionStack,
	};
	ensureStackContainsMessage(untouched);
	assert.equal(untouched.stack, assertionStack);

	const headerless = { name: 'Error', message: 'worker died', stack: '    at pool.ts:1:1' };
	ensureStackContainsMessage(headerless);
	assert.equal(headerless.stack, 'Error: worker died\n    at pool.ts:1:1');
});

test('serializes the real timeout message through the JSON reporter', async () => {
	const fileTask = {
		type: 'suite',
		filepath: '/repo/packages/example/example.test.ts',
		name: 'example.test.ts',
		mode: 'run',
		result: { state: 'fail' },
		tasks: [],
	};
	fileTask.tasks.push({
		type: 'test',
		name: 'works',
		mode: 'run',
		file: fileTask,
		result: {
			state: 'fail',
			startTime: 0,
			duration: 1,
			errors: [
				{
					name: 'Error',
					message: 'Test timed out in 5000ms.',
					stack: 'Error: STACK_TRACE_ERROR\n    at /repo/packages/example/example.test.ts:3:1',
				},
			],
		},
		meta: {},
	});
	const logs = [];
	const reporter = new ReactParityJsonReporter();
	reporter.onInit({
		config: { passWithNoTests: true },
		snapshot: { summary: {} },
		logger: { log: (message) => logs.push(message), warn: () => {} },
	});
	await reporter.onTestRunEnd([{ task: fileTask }]);
	assert.equal(logs.length, 1);
	const [assertion] = JSON.parse(logs[0]).testResults[0].assertionResults;
	assert.equal(assertion.status, 'failed');
	assert.deepEqual(assertion.failureMessages, [
		'Error: Test timed out in 5000ms.\n    at /repo/packages/example/example.test.ts:3:1',
	]);
});

test('spawns the required non-Vitest harness without a shell and propagates failures', async () => {
	const calls = [];
	const spawnProcess = (...args) => {
		calls.push(args);
		const child = new EventEmitter();
		setImmediate(() => child.emit('close', calls.length === 1 ? 0 : 7, null));
		return child;
	};
	const run = () =>
		runRequiredNonVitestBindingManifest({
			relativeFile: 'packages/example/audit/react-parity.json',
			harnessPath: '/repo/scripts/react-parity/harness.mjs',
			repo: '/repo',
			spawnProcess,
		});

	await run();
	assert.deepEqual(calls[0], [
		process.execPath,
		[
			'/repo/scripts/react-parity/harness.mjs',
			'run-required-non-vitest',
			'--manifest',
			'packages/example/audit/react-parity.json',
		],
		{ cwd: '/repo', stdio: 'inherit' },
	]);
	await assert.rejects(run, /with exit code 7/);
});

const exampleVitestLanes = [
	{
		id: 'example-runtime',
		project: 'example',
		files: [
			{
				path: 'packages/example/example.test.ts',
				role: 'test',
				cases: [{ fullName: 'suite works' }],
			},
		],
	},
];
const passingVitestReport = JSON.stringify({
	testResults: [
		{
			name: '/repo/packages/example/example.test.ts',
			assertionResults: [{ fullName: 'suite > works', status: 'passed' }],
		},
	],
});

function fakeVitestRun({ report = passingVitestReport, code = 0, signal = null, error } = {}) {
	const calls = [];
	let outputFile;
	const spawnProcess = (...args) => {
		calls.push(args);
		outputFile = args[1]
			.find((arg) => arg.startsWith('--outputFile='))
			.slice('--outputFile='.length);
		const child = new EventEmitter();
		child.stdout = new EventEmitter();
		setImmediate(() => {
			if (error) child.emit('error', error);
			else {
				if (report !== null) writeFileSync(outputFile, report);
				// Even valid stdout cannot substitute for a missing or invalid report.
				child.stdout.emit('data', passingVitestReport);
			}
			child.emit('close', code, signal);
		});
		return child;
	};
	return {
		calls,
		spawnProcess,
		get outputFile() {
			return outputFile;
		},
	};
}

test('runs one native Vitest file shard and writes its verified report', async (t) => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-vitest-report-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const reportPath = join(root, 'reports', 'shard-2.json');
	const child = fakeVitestRun();

	await runRequiredVitestLanes({
		lanes: exampleVitestLanes,
		repo: '/repo',
		shard: '2/3',
		reportPath,
		spawnProcess: child.spawnProcess,
	});
	const { calls } = child;
	assert.equal(calls.length, 1);
	assert.equal(calls[0][0], process.execPath);
	assert.deepEqual(
		calls[0][1],
		buildParityVitestArgv('vitest.react-parity.config.js', '2/3', child.outputFile),
	);
	assert.equal(calls[0][2].cwd, '/repo');
	assert.equal(calls[0][2].stdio, 'inherit');
	assert.equal(calls[0][2].env, process.env);
	assert.equal(await readFile(reportPath, 'utf8'), passingVitestReport);
	assert.equal(existsSync(dirname(child.outputFile)), false);
});

test('rejects missing, malformed, failed and interrupted reports without reusing old evidence', async (t) => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-invalid-report-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const failedReport = JSON.parse(passingVitestReport);
	failedReport.testResults[0].assertionResults[0] = {
		fullName: 'suite > works',
		status: 'failed',
		failureMessages: ['expected visible content to survive the transition'],
	};
	const cases = [
		{ name: 'missing', report: null, expected: /did not produce a readable JSON report/ },
		{ name: 'empty', report: '', expected: /Unexpected end of JSON input/ },
		{ name: 'malformed', report: '{"testResults":', expected: /Unexpected end of JSON input/ },
		{ name: 'invalid shape', report: '{}', expected: /invalid JSON result/ },
		{
			name: 'failed assertion with zero exit',
			report: JSON.stringify(failedReport),
			expected: /expected visible content to survive the transition/,
		},
		{ name: 'nonzero exit', code: 7, expected: /with exit code 7/ },
		{ name: 'signal', code: null, signal: 'SIGTERM', expected: /with signal SIGTERM/ },
		{
			name: 'spawn error',
			error: new Error('could not start Vitest'),
			expected: /could not start Vitest/,
		},
	];
	for (const { name, expected, ...options } of cases) {
		await t.test(name, async () => {
			const reportPath = join(root, `${name}.json`);
			await writeFile(reportPath, passingVitestReport);
			const child = fakeVitestRun(options);
			await assert.rejects(
				runRequiredVitestLanes({
					lanes: exampleVitestLanes,
					repo: '/repo',
					reportPath,
					spawnProcess: child.spawnProcess,
				}),
				expected,
			);
			assert.equal(existsSync(reportPath), false);
			assert.equal(existsSync(dirname(child.outputFile)), false);
		});
	}
});

test('cleans temporary reports without an archive and when process creation throws', async () => {
	const child = fakeVitestRun();
	await runRequiredVitestLanes({
		lanes: exampleVitestLanes,
		repo: '/repo',
		spawnProcess: child.spawnProcess,
	});
	assert.equal(existsSync(dirname(child.outputFile)), false);
	let outputFile;
	await assert.rejects(
		runRequiredVitestLanes({
			lanes: exampleVitestLanes,
			repo: '/repo',
			spawnProcess(_command, args) {
				outputFile = args
					.find((arg) => arg.startsWith('--outputFile='))
					.slice('--outputFile='.length);
				throw new Error('could not create process');
			},
		}),
		/could not create process/,
	);
	assert.equal(existsSync(dirname(outputFile)), false);
});

test('separates real JSON reports from colored Vite output and preserves assertion failures', async (t) => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-noisy-vitest-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const repo = resolve(import.meta.dirname, '../..');
	const configPath = join(root, 'vitest.config.mjs');
	const testPath = join(root, 'example.test.js');
	const reportPath = join(root, 'report.json');
	await writeFile(
		configPath,
		`process.stdout.write('\\u001b[2m12:00:00 PM [vite] configuration loaded\\u001b[0m\\n');
export default ${JSON.stringify({
			root,
			test: {
				include: ['example.test.js'],
				globals: true,
				maxWorkers: 1,
				fileParallelism: false,
			},
		})};`,
	);
	await writeFile(testPath, "test('works', () => expect(1 + 1).toBe(2));");
	const run = () =>
		runRequiredVitestLanes({
			lanes: [
				{
					id: 'example-runtime',
					project: 'example',
					files: [{ path: relative(repo, testPath), role: 'test', cases: [{ fullName: 'works' }] }],
				},
			],
			repo,
			configPath,
			reportPath,
		});
	await run();
	const report = JSON.parse(await readFile(reportPath, 'utf8'));
	assert.equal(report.success, true);
	assert.equal(report.testResults[0].name, testPath);
	assert.equal(report.testResults[0].assertionResults[0].status, 'passed');
	await writeFile(
		testPath,
		"test('works', () => { throw new Error('expected content to remain visible'); });",
	);
	await assert.rejects(run, /expected content to remain visible/);
	assert.equal(existsSync(reportPath), false);
});

test('balances complete non-Vitest manifests using their declared runner work', async (t) => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-non-vitest-shards-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await writeFile(
		join(root, 'browser-inventory.json'),
		JSON.stringify({ tests: Array.from({ length: 12 }, (_, index) => ({ id: index })) }),
	);
	const manifest = (id, lanes) => ({ id, lanes });
	const requiredLane = (id, execution, files = [{ path: `${id}.json`, role: 'support' }]) => ({
		id,
		oracle: 'required',
		execution,
		files,
	});
	const entries = [
		{
			relativeFile: 'browser.json',
			manifest: manifest('browser', [
				requiredLane('browser', {
					kind: 'playwright-full',
					inventory: 'browser-inventory.json',
				}),
			]),
		},
		{
			relativeFile: 'types-a.json',
			manifest: manifest('types-a', [requiredLane('types-a', { kind: 'typescript' })]),
		},
		{
			relativeFile: 'types-b.json',
			manifest: manifest('types-b', [requiredLane('types-b', { kind: 'typescript' })]),
		},
	];
	assert.equal(estimateRequiredNonVitestManifestWeight(entries[0].manifest, root), 17);
	assert.deepEqual(
		createRequiredNonVitestManifestShardPlan(entries, root, 2).map((shard) =>
			shard.items.map((item) => item.relativeFile),
		),
		[['browser.json'], ['types-a.json', 'types-b.json']],
	);
});

test('runs manifests through a bounded work queue', async () => {
	const relativeFiles = ['a.json', 'b.json', 'c.json', 'd.json'];
	const gates = new Map(relativeFiles.map((relativeFile) => [relativeFile, deferred()]));
	const started = [];
	let active = 0;
	let maxActive = 0;
	const running = runRequiredNonVitestBindingLanes(
		options(relativeFiles, async (relativeFile) => {
			started.push(relativeFile);
			active++;
			maxActive = Math.max(maxActive, active);
			await gates.get(relativeFile).promise;
			active--;
		}),
	);

	await waitFor(() => started.length === 2);
	assert.deepEqual(started, ['a.json', 'b.json']);
	assert.equal(maxActive, 2);

	gates.get('a.json').resolve();
	await waitFor(() => started.length === 3);
	assert.deepEqual(started, ['a.json', 'b.json', 'c.json']);

	gates.get('b.json').resolve();
	await waitFor(() => started.length === 4);
	assert.deepEqual(started, relativeFiles);
	assert.equal(maxActive, 2);

	gates.get('c.json').resolve();
	gates.get('d.json').resolve();
	await running;
	assert.equal(active, 0);
});

test('stops scheduling new manifests after a required lane fails', async () => {
	const badGate = deferred();
	const slowGate = deferred();
	const started = [];
	const running = runRequiredNonVitestBindingLanes(
		options(['bad.json', 'slow.json', 'never.json'], async (relativeFile) => {
			started.push(relativeFile);
			if (relativeFile === 'bad.json') {
				await badGate.promise;
				throw new Error('lane failed');
			}
			await slowGate.promise;
		}),
	);
	const rejected = assert.rejects(running, /lane failed/);

	await waitFor(() => started.length === 2);
	badGate.resolve();
	await waitFor(() => started.includes('bad.json'));
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(started, ['bad.json', 'slow.json']);

	slowGate.resolve();
	await rejected;
});

test('rejects an invalid manifest concurrency', async () => {
	await assert.rejects(
		() => runRequiredNonVitestBindingLanes(options([], async () => {}, 0)),
		/concurrency must be a positive integer/,
	);
});
