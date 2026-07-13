import { validateEvaluationTaskSet } from './dataset.js';
import { digestPrediction, digestRunManifest } from './digest.js';
import {
	parseEvaluationResult,
	parseEvaluationRunManifest,
	parsePrediction,
	parseTaskManifest,
	type EvaluationResult,
	type EvaluationRunManifest,
	type Prediction,
	type TaskManifest,
} from './schema.js';

export interface GradeContext {
	index: number;
	run: EvaluationRunManifest;
	predictionDigest: string;
	signal?: AbortSignal;
}

/**
 * The sandboxed grader is injected by the caller. This package deliberately
 * does not execute generated code on the maintainer machine.
 */
export type TaskGrader = (
	task: TaskManifest,
	prediction: Prediction,
	context: GradeContext,
) => EvaluationResult | Promise<EvaluationResult>;

export interface RunEvaluationOptions {
	concurrency?: number;
	signal?: AbortSignal;
}

export interface RunnerDiagnostics {
	missingPredictionTaskIds: string[];
	duplicatePredictionTaskIds: string[];
	incompatiblePredictionTaskIds: string[];
	foreignRunPredictionTaskIds: string[];
	unknownPredictionTaskIds: string[];
}

export interface EvaluationRun {
	results: EvaluationResult[];
	/** The canonical valid subset to pass into createEvaluationReport(). */
	acceptedPredictions: Prediction[];
	diagnostics: RunnerDiagnostics;
}

function compareStrings(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function validateConcurrency(value: number): void {
	if (!Number.isInteger(value) || value < 1) {
		throw new RangeError(`concurrency must be a positive integer; received ${value}`);
	}
}

function validateResolvedBudget(run: EvaluationRunManifest, result: EvaluationResult): void {
	if (result.outcome !== 'resolved') return;
	if (result.metrics.turns > run.limits.maxTurns) {
		throw new TypeError(`Resolved result ${result.taskId} exceeds the turn budget`);
	}
	if (result.metrics.toolCalls > run.limits.maxToolCalls) {
		throw new TypeError(`Resolved result ${result.taskId} exceeds the tool-call budget`);
	}
	if (result.metrics.inputTokens + result.metrics.outputTokens > run.limits.maxTotalTokens) {
		throw new TypeError(`Resolved result ${result.taskId} exceeds the token budget`);
	}
	if (result.durationMs > run.limits.timeoutSeconds * 1000) {
		throw new TypeError(`Resolved result ${result.taskId} exceeds the wall-clock budget`);
	}
}

function validatePublicCommandResults(task: TaskManifest, result: EvaluationResult): void {
	const declaredIds = new Set(task.grader.publicCommands.map((command) => command.id));
	const publicResults = result.commands.filter((command) => command.phase === 'public');
	for (const command of publicResults) {
		if (!declaredIds.has(command.id)) {
			throw new TypeError(`Result ${task.taskId} contains undeclared public command ${command.id}`);
		}
	}
	if (result.outcome !== 'resolved') return;
	for (const command of task.grader.publicCommands) {
		const actual = publicResults.find((resultCommand) => resultCommand.id === command.id);
		if (actual?.outcome !== 'passed') {
			throw new TypeError(`Resolved result ${task.taskId} is missing passed command ${command.id}`);
		}
	}
}

/**
 * Matches one prediction to each task and invokes a caller-owned sandboxed
 * grader. Missing and duplicate predictions are never guessed at: they are
 * omitted from `results` and surfaced in diagnostics, so the strict report
 * counts them as unresolved.
 */
export async function runEvaluation(
	run: EvaluationRunManifest,
	tasks: readonly TaskManifest[],
	predictions: readonly Prediction[],
	grade: TaskGrader,
	options: RunEvaluationOptions = {},
): Promise<EvaluationRun> {
	const concurrency = options.concurrency ?? 1;
	validateConcurrency(concurrency);
	parseEvaluationRunManifest(run);
	for (const task of tasks) parseTaskManifest(task);
	for (const prediction of predictions) parsePrediction(prediction);
	validateEvaluationTaskSet(run, tasks);
	options.signal?.throwIfAborted();
	const runManifestDigest = digestRunManifest(run);
	const orderedTasks = [...tasks].sort((left, right) => compareStrings(left.taskId, right.taskId));

	const tasksById = new Map<string, TaskManifest>();
	for (const task of orderedTasks) {
		if (tasksById.has(task.taskId)) {
			throw new TypeError(`Task manifests contain duplicate task ID: ${task.taskId}`);
		}
		tasksById.set(task.taskId, task);
	}

	const predictionsByTaskId = new Map<string, Prediction[]>();
	for (const prediction of predictions) {
		const bucket = predictionsByTaskId.get(prediction.taskId);
		if (bucket === undefined) {
			predictionsByTaskId.set(prediction.taskId, [prediction]);
		} else {
			bucket.push(prediction);
		}
	}

	const missingPredictionTaskIds: string[] = [];
	const duplicatePredictionTaskIds: string[] = [];
	const incompatiblePredictionTaskIds: string[] = [];
	const foreignRunPredictionTaskIds: string[] = [];
	const jobs: Array<{ index: number; task: TaskManifest; prediction: Prediction }> = [];

	for (let index = 0; index < orderedTasks.length; index++) {
		const task = orderedTasks[index];
		const taskPredictions = predictionsByTaskId.get(task.taskId);

		if (taskPredictions === undefined) {
			missingPredictionTaskIds.push(task.taskId);
		} else if (taskPredictions.length > 1) {
			duplicatePredictionTaskIds.push(task.taskId);
		} else if (
			taskPredictions[0].runId !== run.runId ||
			taskPredictions[0].runManifestDigest !== runManifestDigest
		) {
			foreignRunPredictionTaskIds.push(task.taskId);
		} else if (taskPredictions[0].outputType !== task.prompt.outputType) {
			incompatiblePredictionTaskIds.push(task.taskId);
		} else {
			jobs.push({ index, task, prediction: taskPredictions[0] });
		}
	}

	const unknownPredictionTaskIds = [...predictionsByTaskId.keys()]
		.filter((taskId) => !tasksById.has(taskId))
		.sort(compareStrings);
	missingPredictionTaskIds.sort(compareStrings);
	duplicatePredictionTaskIds.sort(compareStrings);
	incompatiblePredictionTaskIds.sort(compareStrings);
	foreignRunPredictionTaskIds.sort(compareStrings);

	const resultsByIndex = new Map<number, EvaluationResult>();

	async function gradeJob(job: (typeof jobs)[number]): Promise<void> {
		const predictionDigest = digestPrediction(job.prediction);
		const result = parseEvaluationResult(
			await grade(job.task, job.prediction, {
				index: job.index,
				run,
				predictionDigest,
				signal: options.signal,
			}),
		);

		if (result.taskId !== job.task.taskId) {
			throw new TypeError(
				`Grader returned task ID ${JSON.stringify(result.taskId)} for ${JSON.stringify(job.task.taskId)}`,
			);
		}
		if (result.runId !== run.runId) {
			throw new TypeError(
				`Grader returned run ID ${JSON.stringify(result.runId)} for ${JSON.stringify(run.runId)}`,
			);
		}
		if (result.runManifestDigest !== runManifestDigest) {
			throw new TypeError('Grader result run manifest digest does not match the run');
		}
		if (result.benchmarkVersion !== run.benchmarkVersion) {
			throw new TypeError('Grader result benchmark version does not match the run manifest');
		}
		if (result.taskManifestDigest !== run.taskManifestDigest) {
			throw new TypeError('Grader result task manifest digest does not match the run manifest');
		}
		if (result.attempt !== job.prediction.attempt) {
			throw new TypeError('Grader result attempt does not match the prediction');
		}
		if (result.graderVersion !== job.task.grader.graderVersion) {
			throw new TypeError(
				`Grader returned version ${JSON.stringify(result.graderVersion)} for task version ${JSON.stringify(job.task.grader.graderVersion)}`,
			);
		}
		if (result.graderDigest !== job.task.grader.graderDigest) {
			throw new TypeError('Grader result digest does not match the task manifest');
		}
		if (result.scoringPolicyDigest !== job.task.grader.scoringPolicyDigest) {
			throw new TypeError('Grader result scoring policy does not match the task manifest');
		}
		const expectedEnvironmentDigest = job.task.environment.image.slice(
			job.task.environment.image.lastIndexOf('@') + 1,
		);
		if (result.environmentDigest !== expectedEnvironmentDigest) {
			throw new TypeError(
				`Grader returned environment ${JSON.stringify(result.environmentDigest)} for task environment ${JSON.stringify(expectedEnvironmentDigest)}`,
			);
		}
		if (result.predictionDigest !== predictionDigest) {
			throw new TypeError(
				'Grader result prediction digest does not match the submitted prediction',
			);
		}
		validatePublicCommandResults(job.task, result);
		validateResolvedBudget(run, result);
		resultsByIndex.set(job.index, result);
	}

	let nextJob = 0;
	let failed = false;
	let firstError: unknown;
	async function worker(): Promise<void> {
		while (!failed && nextJob < jobs.length) {
			try {
				options.signal?.throwIfAborted();
				await gradeJob(jobs[nextJob++]);
			} catch (error) {
				if (!failed) firstError = error;
				failed = true;
			}
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
	if (failed) throw firstError;

	return {
		results: [...resultsByIndex]
			.sort(([left], [right]) => left - right)
			.map(([, result]) => result),
		acceptedPredictions: jobs.map((job) => job.prediction),
		diagnostics: {
			missingPredictionTaskIds,
			duplicatePredictionTaskIds,
			incompatiblePredictionTaskIds,
			foreignRunPredictionTaskIds,
			unknownPredictionTaskIds,
		},
	};
}
