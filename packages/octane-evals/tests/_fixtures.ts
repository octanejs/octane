import { digestPrediction, digestRunManifest, digestTaskManifests } from '../src/digest.js';
import type {
	EvaluationResult,
	EvaluationRunManifest,
	Prediction,
	ResultOutcome,
	TaskManifest,
} from '../src/schema.js';

export const commit = 'fb03e8c8298403230724f39b0b52e1141a7effb3';
export const environmentDigest = `sha256:${'a'.repeat(64)}`;
export const graderDigest = `sha256:${'b'.repeat(64)}`;
export const scoringPolicyDigest = `sha256:${'c'.repeat(64)}`;
export const limits = {
	timeoutSeconds: 900,
	cpu: 2,
	memoryMb: 4096,
	maxProcesses: 64,
	maxDiskMb: 2048,
	maxOutputBytes: 1_048_576,
	maxTurns: 100,
	maxTotalTokens: 20_000,
	maxToolCalls: 200,
} as const;

export function createTask(
	taskId: string,
	options: Partial<
		Pick<
			TaskManifest,
			| 'suite'
			| 'split'
			| 'executionMode'
			| 'capability'
			| 'portShape'
			| 'packageName'
			| 'benchmarkVersion'
			| 'familyId'
		>
	> = {},
): TaskManifest {
	const suite = options.suite ?? 'tsrx';
	return {
		schemaVersion: '1.1',
		benchmarkVersion: options.benchmarkVersion ?? 'dev-1',
		taskId,
		familyId: options.familyId ?? `family.${taskId}`,
		title: `Task ${taskId}`,
		prompt: {
			statement: 'Implement the requested behavior in the starter application.',
			outputType: 'patch',
			allowedPaths: ['src/App.tsrx'],
		},
		suite,
		split: options.split ?? 'dev',
		executionMode: options.executionMode ?? 'agentic',
		capability: options.capability ?? 'authoring',
		...(suite === 'integration'
			? {
					portShape: options.portShape ?? 'core-adapter',
					packageName: options.packageName ?? '@octanejs/example',
				}
			: {}),
		difficulty: 'standard',
		provenance: {
			createdAt: '2026-07-13',
			publishedAt: '2026-07-13',
			authors: ['Octane maintainers'],
			reviewers: options.split === 'test' ? ['reviewer one', 'reviewer two'] : [],
			sources: [
				{
					repository: 'https://github.com/octanejs/octane',
					commit,
					license: 'MIT',
				},
			],
		},
		environment: {
			repository: 'https://github.com/octanejs/octane',
			baseCommit: commit,
			image: `ghcr.io/octanejs/evals@${environmentDigest}`,
			platform: 'linux/amd64',
			node: '22.18.0',
			pnpm: '11.1.1',
			packageVersions: { octane: '0.1.5' },
			lockfileHash: `sha256:${'d'.repeat(64)}`,
			overlayLockfileHash: `sha256:${'e'.repeat(64)}`,
		},
		context: { mode: 'framework-docs', docsCommit: commit },
		policy: {
			network: 'none',
			...limits,
			writablePaths: ['src'],
		},
		grader: {
			graderVersion: 'dev-1',
			graderDigest,
			scoringPolicyDigest,
			publicCommands: [{ id: 'public-test', command: 'pnpm test' }],
			...(options.split === 'test' ? { hiddenBundleDigest: `sha256:${'e'.repeat(64)}` } : {}),
		},
		tags: ['fixture'],
	};
}

export function createRun(
	tasks: readonly TaskManifest[],
	overrides: Partial<EvaluationRunManifest> = {},
): EvaluationRunManifest {
	const first = tasks[0];
	return {
		schemaVersion: '1.1',
		runId: 'test-run',
		createdAt: '2026-07-13T20:00:00Z',
		benchmarkVersion: first?.benchmarkVersion ?? 'dev-1',
		taskManifestDigest: digestTaskManifests(tasks),
		scoringPolicyDigest,
		executionMode: first?.executionMode ?? 'agentic',
		context: first?.context ?? { mode: 'framework-docs', docsCommit: commit },
		model: {
			provider: 'test-provider',
			name: 'test-model',
			revision: '2026-07-13',
			configurationDigest: `sha256:${'f'.repeat(64)}`,
		},
		harness: {
			repository: 'https://github.com/octanejs/octane',
			commit,
			image: `ghcr.io/octanejs/evals-harness@sha256:${'1'.repeat(64)}`,
		},
		promptArtifacts: [
			{ role: 'system', digest: `sha256:${'2'.repeat(64)}` },
			{ role: 'user-template', digest: `sha256:${'3'.repeat(64)}` },
		],
		tools: [],
		sampling: { temperature: 0, seed: 42, providerOptionsDigest: `sha256:${'4'.repeat(64)}` },
		limits: { ...limits },
		attempts: { attemptsPerTask: 1, aggregation: 'pass@1' },
		...overrides,
	};
}

export function createPrediction(run: EvaluationRunManifest, task: TaskManifest): Prediction {
	return {
		schemaVersion: '1.1',
		runId: run.runId,
		runManifestDigest: digestRunManifest(run),
		taskId: task.taskId,
		outputType: task.prompt.outputType,
		output: 'diff --git a/src/App.tsrx b/src/App.tsrx',
		attempt: 1,
		createdAt: '2026-07-13T20:01:00Z',
	};
}

export function createResult(
	run: EvaluationRunManifest,
	task: TaskManifest,
	prediction: Prediction,
	outcome: ResultOutcome = 'resolved',
): EvaluationResult {
	return {
		schemaVersion: '1.1',
		runId: run.runId,
		runManifestDigest: digestRunManifest(run),
		benchmarkVersion: run.benchmarkVersion,
		taskManifestDigest: run.taskManifestDigest,
		taskId: task.taskId,
		attempt: 1,
		outcome,
		...(outcome === 'resolved' ? {} : { failureStage: 'target-tests' as const }),
		stopReason: 'completed',
		durationMs: 10,
		graderVersion: task.grader.graderVersion,
		graderDigest: task.grader.graderDigest,
		scoringPolicyDigest: task.grader.scoringPolicyDigest,
		environmentDigest,
		predictionDigest: digestPrediction(prediction),
		metrics: { inputTokens: 10, outputTokens: 5, turns: 1, toolCalls: 1 },
		commands: [
			{ id: 'public-test', phase: 'public', outcome: 'passed', durationMs: 10, exitCode: 0 },
		],
	};
}
