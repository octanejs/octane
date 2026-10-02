import { spawn } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Verifies the Strong repair task family:
// - each starter fails Strong compilation with the exact error its prompt quotes,
//   and each reference compiles;
// - each recorded workaround (`tasks/<id>/negatives/<name>/src/App.tsrx`), the
//   rewrites agents reach for when a Strong error blocks them, fails its grader;
// - each recorded alternative answer (`tasks/<id>/alternatives/<name>/src/App.tsrx`)
//   passes it, so a grader cannot quietly reject a valid fix.
// The ledger records which workarounds still compile in Strong mode. A rejection
// that relies only on the behavioral checks is a visible compiler gap and a
// candidate compiler fixture.

const STRONG_REPAIR_FAMILY = 'octane.strong-repair';
const STRONG_COMPILE_TEST = 'compiles in Strong mode';
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '..', '..');
const corpusRoot = join(packageRoot, 'datasets', 'train', 'user-apps-v1');
const tasksRoot = join(corpusRoot, 'tasks');
const ledgerPath = join(corpusRoot, 'strong-repair-negatives.json');
const catalog = JSON.parse(readFileSync(join(corpusRoot, 'catalog.json'), 'utf8'));
const slotTimeoutMs = 90_000;
const { compile } = await import(
	pathToFileURL(join(repositoryRoot, 'packages', 'octane', 'src', 'compiler', 'compile.js')).href
);

const tasks = catalog.tasks.filter((task) => task.familyId === STRONG_REPAIR_FAMILY);
const problems = [];
for (const task of tasks) {
	const taskRoot = join(tasksRoot, task.taskId);
	const strongError = (kind) => {
		try {
			compile(readFileSync(join(taskRoot, kind, 'src', 'App.tsrx'), 'utf8'), 'src/App.tsrx', {
				strong: true,
			});
			return null;
		} catch (error) {
			return error.message;
		}
	};
	const starterError = strongError('starter');
	const referenceError = strongError('reference');
	if (starterError === null) {
		problems.push(`${task.taskId}: the starter compiles in Strong mode.`);
	} else if (!readFileSync(join(taskRoot, 'prompt.md'), 'utf8').includes(starterError)) {
		problems.push(
			`${task.taskId}: prompt.md does not quote the starter's current error:\n${starterError}`,
		);
	}
	if (referenceError !== null)
		problems.push(`${task.taskId}: the reference fails: ${referenceError}`);
}
const slots = [];
for (const task of tasks) {
	const entries = ['negatives', 'alternatives'].flatMap((kind) => {
		const root = join(tasksRoot, task.taskId, kind);
		return existsSync(root)
			? readdirSync(root, { withFileTypes: true })
					.filter((entry) => entry.isDirectory())
					.map((entry) => entry.name)
					.sort()
					.map((name) => ({ taskId: task.taskId, kind, name, directory: join(root, name) }))
			: [];
	});
	entries.forEach((entry, index) => (slots[index] ??= []).push(entry));
}

// A submission alias is keyed by task ID, so one Vitest run can grade at most one
// negative per task. Independent slots run concurrently.
function gradeSlot(entries) {
	const aliasRoot = mkdtempSync(join(tmpdir(), 'octane-eval-strong-repair-'));
	const reportPath = join(aliasRoot, 'report.json');
	for (const entry of entries) symlinkSync(entry.directory, join(aliasRoot, entry.taskId), 'dir');
	const graders = entries.map((entry) => join(tasksRoot, entry.taskId, 'grader.test.ts'));
	return new Promise((resolvePromise, reject) => {
		const child = spawn(
			join(repositoryRoot, 'node_modules', '.bin', 'vitest'),
			[
				'run',
				'--project',
				'octane-evals-user-apps',
				'--reporter=json',
				`--outputFile=${reportPath}`,
				...graders,
			],
			{
				cwd: repositoryRoot,
				env: { ...process.env, OCTANE_EVAL_SANDBOX: '1', OCTANE_EVAL_SUBMISSION_ROOT: aliasRoot },
				stdio: 'ignore',
			},
		);
		const timer = setTimeout(() => child.kill('SIGKILL'), slotTimeoutMs);
		child.on('error', reject);
		child.on('close', (_code, signal) => {
			clearTimeout(timer);
			try {
				if (signal !== null) throw new Error(`Negative grading terminated by ${signal}.`);
				const report = JSON.parse(readFileSync(reportPath, 'utf8'));
				const byTask = new Map(
					report.testResults.map((result) => [basename(dirname(result.name)), result]),
				);
				resolvePromise(entries.map((entry) => ({ ...entry, result: byTask.get(entry.taskId) })));
			} catch (error) {
				reject(error);
			} finally {
				rmSync(aliasRoot, { recursive: true, force: true });
			}
		});
	});
}

const graded = (await Promise.all(slots.map(gradeSlot))).flat();
const ledger = {};
for (const { taskId, kind, name, directory, result } of graded) {
	const key = `${taskId}/${name}`;
	const assertions = result?.assertionResults ?? [];
	const compile = assertions.find((assertion) => assertion.title === STRONG_COMPILE_TEST);
	const behavior = assertions.filter((assertion) => assertion.title !== STRONG_COMPILE_TEST);
	if (!result || !compile || behavior.length === 0) {
		problems.push(`${key}: the task grader did not run its Strong and behavior checks.`);
		continue;
	}
	if (kind === 'alternatives') {
		const failed = assertions.filter((assertion) => assertion.status !== 'passed');
		if (failed.length > 0) {
			problems.push(
				`${key}: the grader rejects this valid alternative (${failed.map((assertion) => assertion.title).join('; ')}). Fix the grader or ${relative(repositoryRoot, directory)}.`,
			);
		}
		continue;
	}
	const compiles = compile.status === 'passed';
	if (compiles && behavior.every((assertion) => assertion.status === 'passed')) {
		problems.push(
			`${key}: the grader accepts this workaround. Strengthen the behavioral checks or remove ${relative(repositoryRoot, directory)}.`,
		);
	}
	ledger[key] = compiles ? 'compiles-keeps-bug' : 'rejected-by-strong';
}
if (problems.length > 0) {
	console.error(problems.join('\n'));
	process.exit(1);
}

const sorted = Object.fromEntries(Object.entries(ledger).sort(([a], [b]) => (a < b ? -1 : 1)));
const content = `${JSON.stringify(sorted, null, 2)}\n`;
const gaps = Object.values(sorted).filter((status) => status === 'compiles-keeps-bug').length;
const workarounds = Object.keys(sorted).length;
const alternatives = graded.length - workarounds;
if (process.argv.includes('--check')) {
	if (!existsSync(ledgerPath) || readFileSync(ledgerPath, 'utf8') !== content) {
		console.error(
			`${relative(repositoryRoot, ledgerPath)} is stale; run bun run --filter @octanejs/evals strong-repair:verify`,
		);
		process.exit(1);
	}
	console.log(
		`verified ${tasks.length} Strong repair tasks, ${alternatives} alternative answers, and ${workarounds} workarounds (${gaps} compile and keep the bug)`,
	);
} else {
	writeFileSync(ledgerPath, content);
	console.log(
		`wrote ${relative(repositoryRoot, ledgerPath)}: ${workarounds} workarounds, ${gaps} compile and keep the bug (${alternatives} alternative answers pass)`,
	);
}
