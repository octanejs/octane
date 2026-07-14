import { readFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '..', '..');
const corpusRoot = join(packageRoot, 'datasets', 'train', 'user-apps-v1');
const tasksRoot = join(corpusRoot, 'tasks');
const catalog = JSON.parse(readFileSync(join(corpusRoot, 'catalog.json'), 'utf8'));
const aliasRoot = mkdtempSync(join(tmpdir(), 'octane-eval-starters-'));
const reportRoot = mkdtempSync(join(tmpdir(), 'octane-eval-report-'));
const reportPath = join(reportRoot, 'starters.json');
const starterSuiteTimeoutMs = 60_000;

try {
	for (const task of catalog.tasks) {
		symlinkSync(join(tasksRoot, task.taskId, 'starter'), join(aliasRoot, task.taskId), 'dir');
	}

	const result = spawnSync(
		join(repositoryRoot, 'node_modules', '.bin', 'vitest'),
		['run', '--project', 'octane-evals-user-apps', '--reporter=json', `--outputFile=${reportPath}`],
		{
			cwd: repositoryRoot,
			encoding: 'utf8',
			env: {
				...process.env,
				OCTANE_EVAL_SANDBOX: '1',
				OCTANE_EVAL_SUBMISSION_ROOT: aliasRoot,
			},
			maxBuffer: 10 * 1024 * 1024,
			timeout: starterSuiteTimeoutMs,
			killSignal: 'SIGKILL',
		},
	);

	if (result.error || result.signal !== null || result.status === null || result.status === 0) {
		throw new Error(
			result.error?.message ??
				(result.signal === null ? undefined : `Starter grader terminated by ${result.signal}.`) ??
				`Expected every incomplete starter to fail its grader, but Vitest exited ${result.status}.`,
		);
	}

	const report = JSON.parse(readFileSync(reportPath, 'utf8'));
	const resultsByTask = new Map(
		report.testResults.map((testResult) => [basename(dirname(testResult.name)), testResult]),
	);
	const infrastructureFailure =
		/Failed to load|Transform failed|SyntaxError|Cannot find (?:module|package)|RollupError/;

	for (const task of catalog.tasks) {
		const testResult = resultsByTask.get(task.taskId);
		if (!testResult) throw new Error(`${task.taskId}: grader did not run against its starter.`);
		if (testResult.status !== 'failed') {
			throw new Error(`${task.taskId}: incomplete starter unexpectedly passed.`);
		}
		if (!testResult.assertionResults.some((assertion) => assertion.status === 'failed')) {
			throw new Error(`${task.taskId}: failed before a behavioral assertion ran.`);
		}
		if (infrastructureFailure.test(testResult.message ?? '')) {
			throw new Error(`${task.taskId}: failed because the starter or harness could not load.`);
		}
	}

	console.log(
		`verified ${catalog.tasks.length} incomplete starters load and fail their behavioral graders`,
	);
} finally {
	rmSync(aliasRoot, { recursive: true, force: true });
	rmSync(reportRoot, { recursive: true, force: true });
}
