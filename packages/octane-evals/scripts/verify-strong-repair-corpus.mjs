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
//   and each reference compiles (without --check, a stale quote of the same
//   diagnostic code is rewritten to the current message);
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
const { compile } = await import(
	pathToFileURL(join(repositoryRoot, 'packages', 'octane', 'src', 'compiler', 'compile.js')).href
);

const check = process.argv.includes('--check');
const tasks = catalog.tasks.filter((task) => task.familyId === STRONG_REPAIR_FAMILY);
const problems = [];
const refreshedPrompts = [];
const diagnosticCode = (message) => /\[(OCTANE_[A-Z_]+)\]/.exec(message)?.[1];
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
	const promptPath = join(taskRoot, 'prompt.md');
	const prompt = readFileSync(promptPath, 'utf8');
	const quoted = /```text\n([^\n]*)\n```/.exec(prompt);
	if (starterError === null) {
		problems.push(`${task.taskId}: the starter compiles in Strong mode.`);
	} else if (
		!prompt.includes(starterError) &&
		!check &&
		quoted !== null &&
		diagnosticCode(quoted[1]) === diagnosticCode(starterError)
	) {
		writeFileSync(
			promptPath,
			prompt.replace(quoted[0], () => `\`\`\`text\n${starterError}\n\`\`\``),
		);
		refreshedPrompts.push(task.taskId);
	} else if (!prompt.includes(starterError)) {
		problems.push(
			`${task.taskId}: prompt.md does not quote the starter's current error${check ? ' (pnpm --filter @octanejs/evals strong-repair:verify refreshes a quote of the same diagnostic)' : ''}:\n${starterError}`,
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
// negative per task. Each run already spreads its graders across the CPUs, so a
// second concurrent run only has to cover another run's startup. Starting every
// slot at once oversubscribed a 4-vCPU CI runner about eightfold, until each slot
// took as long as the whole corpus. Slots never grow, so the largest start first.
// All runs share one deadline, which keeps this script's worst case below the
// timeout in tests/user-app-corpus.test.ts. Grading time on the 4-vCPU CI runner
// follows the runner's speed, which varies about twofold. The deadline is about
// twice the slowest grading seen on main, which was about 95 seconds.
const slotConcurrency = 2;
const gradingTimeoutMs = 180_000;
const runningSlots = new Map();
let gradingFailure;

function stopGrading(error) {
	gradingFailure ??= error;
	for (const child of runningSlots.keys()) child.kill('SIGKILL');
}

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
		runningSlots.set(child, entries);
		child.on('error', reject);
		child.on('close', (_code, signal) => {
			runningSlots.delete(child);
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

const gradedSlots = [];
let nextSlot = 0;
const deadline = setTimeout(() => {
	const unfinished = [...runningSlots.values()].map((entries) =>
		entries.map(({ taskId, name }) => `${taskId}/${name}`).join(', '),
	);
	stopGrading(
		new Error(
			`Strong repair grading exceeded ${gradingTimeoutMs / 1000} seconds. Still grading:\n${unfinished.join('\n')}`,
		),
	);
}, gradingTimeoutMs);
await Promise.all(
	Array.from({ length: Math.min(slotConcurrency, slots.length) }, async () => {
		while (gradingFailure === undefined && nextSlot < slots.length) {
			const index = nextSlot++;
			try {
				gradedSlots[index] = await gradeSlot(slots[index]);
			} catch (error) {
				stopGrading(error);
			}
		}
	}),
);
clearTimeout(deadline);
if (gradingFailure !== undefined) throw gradingFailure;
const graded = gradedSlots.flat();
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
if (check) {
	if (!existsSync(ledgerPath) || readFileSync(ledgerPath, 'utf8') !== content) {
		console.error(
			`${relative(repositoryRoot, ledgerPath)} is stale; run pnpm --filter @octanejs/evals strong-repair:verify`,
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
	if (refreshedPrompts.length > 0) {
		console.log(
			`refreshed the quoted error in ${refreshedPrompts.join(', ')}; run pnpm --filter @octanejs/evals corpus:generate`,
		);
	}
}
