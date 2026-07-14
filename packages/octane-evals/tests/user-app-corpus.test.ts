import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { digestWorkspaceFiles, sha256Digest, type WorkspaceDigestFile } from '../src/digest.js';
import { parsePublicTaskManifestJsonl } from '../src/jsonl.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = join(packageRoot, '..', '..');
const corpusRoot = join(packageRoot, 'datasets', 'train', 'user-apps-v1');
const generatorTimeoutMs = 10_000;
const gradingCommandTimeoutMs = 20_000;
// The verifier gives its nested Vitest run 60 seconds, so this wrapper must leave
// enough time for that timeout to surface its own actionable error under CI load.
const starterVerificationTimeoutMs = 70_000;

interface UserAppCatalog {
	environment: {
		baseCommit: string;
		lockfileHash: string;
	};
	tasks: Array<{ taskId: string; tags: string[] }>;
	coverage: Record<string, Record<string, string[]>>;
}

const REQUIRED_COVERAGE = {
	codingPatterns: [
		'component-composition',
		'hooks',
		'native-events',
		'state-updates',
		'keyed-reconciliation',
		'tsrx-control-flow',
	],
	reactDivergences: [
		'conditional-hooks',
		'inferred-hook-dependencies',
		'current-state-getter',
		'native-controlled-events',
		'class-composition',
		'refs-as-props',
		'parallel-use',
	],
	integrations: ['zustand', 'hook-form', 'i18next', 'tanstack-query'],
} as const;

function readCatalog(): UserAppCatalog {
	return JSON.parse(readFileSync(join(corpusRoot, 'catalog.json'), 'utf8'));
}

function readWorkspace(directory: string, root = directory): WorkspaceDigestFile[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory()
			? readWorkspace(path, root)
			: [{ path: relative(root, path).replaceAll('\\', '/'), content: readFileSync(path) }];
	});
}

function readGrader(grader: string): WorkspaceDigestFile[] {
	return [
		{ path: 'task/grader.test.ts', content: readFileSync(grader) },
		{
			path: 'shared/source-contracts.test.ts',
			content: readFileSync(join(corpusRoot, 'source-contracts.test.ts')),
		},
		{
			path: 'harness/grade-user-app.mjs',
			content: readFileSync(join(packageRoot, 'scripts', 'grade-user-app.mjs')),
		},
		{
			path: 'harness/vitest.config.js',
			content: readFileSync(join(repositoryRoot, 'vitest.config.js')),
		},
	];
}

describe('public user-app training corpus', () => {
	it('contains real tasks across TSRX, Octane, and integrations', () => {
		const catalog = readCatalog();
		const tasks = parsePublicTaskManifestJsonl(
			readFileSync(join(corpusRoot, 'manifest.jsonl'), 'utf8'),
		);
		const overlayLockfileDigest = sha256Digest(
			readFileSync(join(repositoryRoot, 'pnpm-lock.yaml')),
		);
		expect(tasks).toHaveLength(catalog.tasks.length);
		expect(new Set(tasks.map((task) => task.suite))).toEqual(
			new Set(['tsrx', 'octane', 'integration']),
		);

		for (const task of tasks) {
			expect(task.split).toBe('train');
			expect(task.workspace?.kind).toBe('template');
			const taskRoot = join(corpusRoot, 'tasks', task.taskId);
			const starterRoot = join(taskRoot, 'starter');
			const reference = join(taskRoot, 'reference', 'src', 'App.tsrx');
			const grader = join(taskRoot, 'grader.test.ts');
			expect(existsSync(reference), `${task.taskId} reference`).toBe(true);
			expect(existsSync(grader), `${task.taskId} grader`).toBe(true);
			expect(task.prompt.statement).toBe(readFileSync(join(taskRoot, 'prompt.md'), 'utf8').trim());
			expect(task.workspace?.templatePath).toBe(
				relative(packageRoot, starterRoot).replaceAll('\\', '/'),
			);
			expect(task.workspace?.templateDigest).toBe(digestWorkspaceFiles(readWorkspace(starterRoot)));
			expect(task.trainingArtifacts?.referencePath).toBe(
				relative(packageRoot, reference).replaceAll('\\', '/'),
			);
			expect(task.trainingArtifacts?.referenceDigest).toBe(sha256Digest(readFileSync(reference)));
			expect(task.environment.baseCommit).toBe(catalog.environment.baseCommit);
			expect(task.environment.lockfileHash).toBe(catalog.environment.lockfileHash);
			expect(task.environment.overlayLockfileHash).toBe(overlayLockfileDigest);
			expect(task.grader.graderDigest).toBe(digestWorkspaceFiles(readGrader(grader)));
			expect(readFileSync(join(starterRoot, 'src', 'App.tsrx'), 'utf8')).not.toBe(
				readFileSync(reference, 'utf8'),
			);
		}

		const directoryTaskIds = readdirSync(join(corpusRoot, 'tasks'), { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
		expect(directoryTaskIds).toEqual(catalog.tasks.map((task) => task.taskId).sort());
	});

	it('machine-checks the requested coding patterns and React divergences', () => {
		const catalog = readCatalog();
		const tasksById = new Map(catalog.tasks.map((task) => [task.taskId, task]));
		expect(Object.keys(catalog.coverage).sort()).toEqual(Object.keys(REQUIRED_COVERAGE).sort());
		for (const [group, competencies] of Object.entries(REQUIRED_COVERAGE)) {
			expect(Object.keys(catalog.coverage[group]).sort()).toEqual([...competencies].sort());
		}

		for (const competencies of Object.values(catalog.coverage)) {
			for (const [competency, taskIds] of Object.entries(competencies)) {
				expect(taskIds.length, `${competency} has no task`).toBeGreaterThan(0);
				expect(new Set(taskIds).size, `${competency} repeats a task`).toBe(taskIds.length);
				for (const taskId of taskIds) {
					const task = tasksById.get(taskId);
					expect(task, `${competency} references ${taskId}`).toBeDefined();
					expect(task?.tags, `${taskId} declares ${competency}`).toContain(competency);
				}
			}
		}
	});

	it('publishes prompt, starter, and reference code as training conversations', () => {
		const examples = readFileSync(join(corpusRoot, 'training.jsonl'), 'utf8')
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		const catalog = readCatalog();
		expect(examples).toHaveLength(catalog.tasks.length);

		for (const example of examples) {
			const taskRoot = join(corpusRoot, 'tasks', example.taskId);
			const prompt = readFileSync(join(taskRoot, 'prompt.md'), 'utf8').trim();
			const starter = readFileSync(join(taskRoot, 'starter', 'src', 'App.tsrx'), 'utf8').trim();
			const reference = readFileSync(join(taskRoot, 'reference', 'src', 'App.tsrx'), 'utf8').trim();
			expect(example.messages.map((message: { role: string }) => message.role)).toEqual([
				'system',
				'user',
				'assistant',
			]);
			expect(example.messages[1].content).toContain(prompt);
			expect(example.messages[1].content).toContain(starter);
			expect(example.messages[2].content).toBe(reference);
		}
	});

	it('keeps the generated manifest current', () => {
		execFileSync(process.execPath, ['scripts/generate-user-app-corpus.mjs', '--check'], {
			cwd: packageRoot,
			stdio: 'pipe',
			timeout: generatorTimeoutMs,
			killSignal: 'SIGKILL',
		});
	});

	it('grades a relative submission from the public command invocation directory', () => {
		execFileSync(
			'pnpm',
			[
				'--filter',
				'@octanejs/evals',
				'grade:user-app',
				'--',
				'--task',
				'tsrx.counter',
				'--submission',
				'.',
			],
			{
				cwd: join(corpusRoot, 'tasks', 'tsrx.counter', 'reference'),
				env: { ...process.env, OCTANE_EVAL_SANDBOX: '1' },
				stdio: 'pipe',
				timeout: gradingCommandTimeoutMs,
				killSignal: 'SIGKILL',
			},
		);
	}, 30_000);

	it('keeps every incomplete starter behaviorally unresolved', () => {
		execFileSync(process.execPath, ['scripts/verify-user-app-starters.mjs'], {
			cwd: packageRoot,
			stdio: 'pipe',
			timeout: starterVerificationTimeoutMs,
			killSignal: 'SIGKILL',
		});
	}, 75_000);
});
