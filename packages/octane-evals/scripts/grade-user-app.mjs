import { execFileSync } from 'node:child_process';
import {
	existsSync,
	lstatSync,
	mkdtempSync,
	readdirSync,
	realpathSync,
	rmSync,
	symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '..', '..');
const tasksRoot = join(packageRoot, 'datasets', 'train', 'user-apps-v1', 'tasks');
const sourceContracts = join(
	packageRoot,
	'datasets',
	'train',
	'user-apps-v1',
	'source-contracts.test.ts',
);
const graderTimeoutMs = 120_000;

function readFlag(name) {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

const taskId = readFlag('--task');
const submission = readFlag('--submission');
if (!taskId || !/^[a-z0-9][a-z0-9._-]*$/.test(taskId) || !submission) {
	console.error('Usage: grade-user-app --task <task-id> --submission <directory>');
	process.exit(2);
}
if (process.env.OCTANE_EVAL_SANDBOX !== '1') {
	console.error(
		'Refusing to execute a model submission outside an evaluation sandbox. Set OCTANE_EVAL_SANDBOX=1 only inside the isolated candidate environment.',
	);
	process.exit(2);
}

const grader = join(tasksRoot, taskId, 'grader.test.ts');
if (!existsSync(grader)) {
	console.error(`Unknown user-app evaluation task: ${taskId}`);
	process.exit(2);
}

const invocationRoot = process.env.INIT_CWD ? resolve(process.env.INIT_CWD) : process.cwd();
const submissionRoot = realpathSync(resolve(invocationRoot, submission));
const submissionFiles = [];
function collectSubmissionFiles(directory) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isSymbolicLink() || lstatSync(path).isSymbolicLink()) {
			throw new Error(`Submission symlinks are not allowed: ${relative(submissionRoot, path)}`);
		}
		if (entry.isDirectory()) collectSubmissionFiles(path);
		else if (entry.isFile())
			submissionFiles.push(relative(submissionRoot, path).replaceAll('\\', '/'));
		else throw new Error(`Unsupported submission entry: ${relative(submissionRoot, path)}`);
	}
}
collectSubmissionFiles(submissionRoot);
submissionFiles.sort();
if (submissionFiles.length !== 1 || submissionFiles[0] !== 'src/App.tsrx') {
	console.error(
		`Submission must contain only src/App.tsrx; received: ${submissionFiles.join(', ') || '(empty)'}`,
	);
	process.exit(2);
}

const aliasRoot = mkdtempSync(join(tmpdir(), 'octane-eval-submission-'));
try {
	symlinkSync(submissionRoot, join(aliasRoot, taskId), 'dir');
	execFileSync(
		join(repositoryRoot, 'node_modules', '.bin', 'vitest'),
		['run', '--project', 'octane-evals-user-apps', grader, sourceContracts],
		{
			cwd: repositoryRoot,
			stdio: 'inherit',
			timeout: graderTimeoutMs,
			killSignal: 'SIGKILL',
			env: {
				...process.env,
				OCTANE_EVAL_SUBMISSION_ROOT: aliasRoot,
				OCTANE_EVAL_TASK_ID: taskId,
			},
		},
	);
} finally {
	rmSync(aliasRoot, { recursive: true, force: true });
}
