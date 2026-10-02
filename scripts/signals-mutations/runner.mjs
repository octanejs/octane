import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const mutationRoot = resolve(import.meta.dirname, '../..');

// Vite IDs can carry a query or use a file URL. A suffix match also accepts a
// donor checkout, so compare actual filesystem identities instead.
export function realFile(id) {
	if (typeof id !== 'string') return undefined;
	try {
		const file = id.split('?')[0];
		return realpathSync(file.startsWith('file:') ? fileURLToPath(file) : file);
	} catch {
		return undefined;
	}
}

export function classifyMutation(report, request, execution, expectedIds) {
	const error = (reason) => ({ status: 'runner-error', reason, targetIds: undefined });
	if (execution.timedOut) return error('timeout');
	if (execution.error || execution.signal) return error('process-error');
	if (!report || report.version !== 1) return error('invalid-report');
	if (
		report.nonce !== request.nonce ||
		report.row !== request.row.id ||
		report.phase !== request.phase
	)
		return error('stale-report');
	if (report.runnerError) return error('runner-error');
	if (!Array.isArray(report.transforms)) return error('invalid-report');
	if (report.transforms.length !== 1) return error('transform-count');
	const transform = report.transforms[0];
	if (!transform || typeof transform.file !== 'string' || !Number.isInteger(transform.matches))
		return error('invalid-report');
	if (transform.file !== realFile(resolve(request.root, request.row.file)))
		return error('wrong-source');
	if (transform.matches !== 1) return error('source-match');
	if (report.reason !== 'passed' && report.reason !== 'failed') return error('interrupted-run');
	if (!Array.isArray(report.errors) || report.errors.length) return error('suite-or-global-error');
	if (!Array.isArray(report.tests)) return error('invalid-report');
	if (
		report.tests.some(
			(test) =>
				!test ||
				typeof test.id !== 'string' ||
				!test.id ||
				typeof test.name !== 'string' ||
				typeof test.hookFailed !== 'boolean' ||
				typeof test.flaky !== 'boolean' ||
				!Number.isInteger(test.retryCount) ||
				test.retryCount < 0 ||
				!Number.isInteger(test.repeatCount) ||
				test.repeatCount < 0 ||
				!Array.isArray(test.errors) ||
				test.errors.some((error) => !error || typeof error.name !== 'string'),
		)
	)
		return error('invalid-report');
	const tests = request.row.tests.map((name) => report.tests.filter((test) => test.name === name));
	if (tests.some((matches) => matches.length !== 1)) return error('missing-or-duplicate-target');
	const targets = tests.flat();
	if (new Set(targets.map((test) => test.id)).size !== targets.length)
		return error('duplicate-target-id');
	if (
		targets.some(
			(test) =>
				test.project !== request.row.project ||
				test.file !== realFile(resolve(request.root, request.row.testFile)),
		)
	)
		return error('wrong-target');
	if (
		request.phase !== 'normal' &&
		(!Array.isArray(expectedIds) ||
			expectedIds.length !== targets.length ||
			expectedIds.some((id) => typeof id !== 'string' || !id) ||
			new Set(expectedIds).size !== expectedIds.length)
	)
		return error('invalid-target-ids');
	if (expectedIds && targets.some((test, index) => test.id !== expectedIds[index]))
		return error('changed-target-id');
	if (targets.some((test) => !['passed', 'failed'].includes(test.state)))
		return error('unexecuted-target');
	if (report.tests.some((test) => test.state !== 'skipped' && !targets.includes(test)))
		return error('unexpected-test');
	if (report.tests.some((test) => !targets.includes(test) && test.errors.length))
		return error('unexpected-error');
	if (
		report.tests.some(
			(test) => test.hookFailed || test.retryCount || test.repeatCount || test.flaky,
		)
	)
		return error('hook-or-retry');
	if (targets.every((test) => test.state === 'passed' && test.errors.length === 0)) {
		if (execution.code !== 0 || report.reason !== 'passed') return error('unexpected-exit');
		return {
			status: request.phase === 'normal' ? 'passed' : 'survived',
			reason: undefined,
			targetIds: targets.map((test) => test.id),
		};
	}
	if (request.phase !== 'mutant') return error('control-failed');
	if (execution.code !== 1 || report.reason !== 'failed') return error('unexpected-exit');
	if (
		!targets.every(
			(test) =>
				test.state === 'failed' &&
				test.errors.length === 1 &&
				test.errors[0].name === 'AssertionError' &&
				test.errors[0].firstFile === realFile(resolve(request.root, request.row.testFile)),
		)
	)
		return error('unintended-failure');
	return { status: 'killed', reason: undefined, targetIds: targets.map((test) => test.id) };
}

export async function runMutation(row, phase, options = {}) {
	if (process.env.OCTANE_SIGNALS_MUTATION_CHILD)
		throw new Error('Nested mutation runners are not allowed');
	if (!['normal', 'mutant', 'noop'].includes(phase))
		throw new Error(`Unknown mutation phase: ${phase}`);
	if (
		!row.id ||
		!row.project ||
		row.project === 'octane-signals-mutations' ||
		!row.find ||
		!row.replace ||
		!row.tests?.length ||
		new Set(row.tests).size !== row.tests.length
	)
		throw new Error('Invalid mutation row');
	const temporaryRoot = resolve(tmpdir(), 'octane-signals-mutations');
	await mkdir(temporaryRoot, { recursive: true });
	const directory = await mkdtemp(resolve(temporaryRoot, 'run-'));
	const request = {
		root: mutationRoot,
		row,
		phase,
		nonce: randomUUID(),
		testMutation: options.testMutation,
	};
	const requestFile = resolve(directory, 'request.json');
	const reportFile = resolve(directory, 'report.json');
	try {
		await writeFile(requestFile, JSON.stringify(request));
		const execution = await new Promise((done) => {
			const child = spawn(
				process.execPath,
				[resolve(import.meta.dirname, 'child.mjs'), requestFile, reportFile],
				{
					cwd: mutationRoot,
					env: { ...process.env, OCTANE_SIGNALS_MUTATION_CHILD: '1' },
					stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
					windowsHide: true,
					detached: false,
				},
			);
			let stdout = '',
				stderr = '',
				timedOut = false,
				error,
				cleanupError;
			const startedTests = [];
			child.stdout.on('data', (chunk) => {
				stdout = (stdout + chunk).slice(-64_000);
			});
			child.stderr.on('data', (chunk) => {
				stderr = (stderr + chunk).slice(-64_000);
			});
			child.on('error', (cause) => {
				error = String(cause);
			});
			const terminate = () => {
				if (child.exitCode !== null || child.signalCode !== null) return;
				timedOut = true;
				if (child.pid && process.platform === 'win32') {
					const cleanup = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
						windowsHide: true,
						detached: false,
						stdio: 'ignore',
						timeout: 5_000,
					});
					if (cleanup.error || cleanup.status !== 0) {
						cleanupError = String(cleanup.error ?? `taskkill exited ${cleanup.status}`);
						child.kill('SIGKILL');
					}
				} else {
					// The child uses worker threads, so terminating its process also
					// terminates the test workers without a detached process group.
					child.kill('SIGKILL');
				}
			};
			let timer = setTimeout(terminate, options.timeout ?? 60_000);
			child.on('message', (message) => {
				if (message?.nonce !== request.nonce || message.type !== 'test-started') return;
				startedTests.push(message.id);
				if (startedTests.length === 1 && options.timeoutAfterTestStarted) {
					clearTimeout(timer);
					timer = setTimeout(terminate, options.timeoutAfterTestStarted);
				}
			});
			child.on('close', (code, signal) => {
				clearTimeout(timer);
				done({
					pid: child.pid,
					code,
					signal,
					timedOut,
					error,
					cleanupError,
					stdout,
					stderr,
					startedTests,
				});
			});
		});
		let report;
		try {
			if ((await stat(reportFile)).size <= 1_048_576) {
				const bytes = await readFile(reportFile);
				if (bytes.length <= 1_048_576) report = JSON.parse(bytes.toString('utf8'));
			}
		} catch {
			/* Missing/malformed reports are runner errors. */
		}
		return {
			...classifyMutation(report, request, execution, options.expectedIds),
			report,
			execution,
			request,
		};
	} finally {
		if (dirname(resolve(directory)) !== temporaryRoot)
			throw new Error('Unexpected mutation temporary directory');
		await rm(directory, { recursive: true, force: true });
	}
}
