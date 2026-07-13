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

export type TaskDisposition =
	| 'resolved'
	| 'reported-unresolved'
	| 'error'
	| 'missing'
	| 'duplicate';

interface ScoredTask {
	task: TaskManifest;
	disposition: TaskDisposition;
	result?: EvaluationResult;
}

export interface ConfidenceInterval95 {
	confidenceLevel: 0.95;
	lower: number;
	upper: number;
}

/** Strict pass@1 task-level score. Every task is in the denominator. */
export interface ScoreSummary {
	taskCount: number;
	resolvedCount: number;
	unresolvedCount: number;
	reportedUnresolvedCount: number;
	errorCount: number;
	missingResultCount: number;
	duplicateResultCount: number;
	resolvedRate: number;
	resolvedRateConfidenceInterval95: ConfidenceInterval95;
}

export interface BreakdownGroup<TKey extends string> extends ScoreSummary {
	key: TKey;
}

/**
 * A macro average gives every represented group equal weight. Tasks without a
 * value for an optional dimension are excluded and counted separately.
 */
export interface MacroBreakdown<TKey extends string> {
	groupCount: number;
	taskCount: number;
	excludedTaskCount: number;
	macroResolvedRate: number;
	groups: BreakdownGroup<TKey>[];
}

export interface ResultDiagnostics {
	missingTaskIds: string[];
	duplicateResultIds: string[];
}

export interface TaskReportRow {
	taskId: string;
	suite: TaskManifest['suite'];
	capability: TaskManifest['capability'];
	portShape?: TaskManifest['portShape'];
	packageName?: string;
	disposition: TaskDisposition;
	/** Includes command outcomes and usage; absent for missing or duplicate results. */
	result?: EvaluationResult;
}

export interface EvaluationReport {
	runId: string;
	runManifestDigest: string;
	benchmarkVersion: string;
	taskManifestDigest: string;
	executionMode: EvaluationRunManifest['executionMode'];
	contextMode: EvaluationRunManifest['context']['mode'];
	overall: ScoreSummary;
	bySuite: MacroBreakdown<TaskManifest['suite']>;
	byCapability: MacroBreakdown<TaskManifest['capability']>;
	byPortShape: MacroBreakdown<NonNullable<TaskManifest['portShape']>>;
	byPackage: MacroBreakdown<string>;
	tasks: TaskReportRow[];
	diagnostics: ResultDiagnostics;
}

function compareStrings(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Descriptive Wilson interval. Related task families can violate the
 * independent-trials assumption, so releases must also disclose clustering.
 */
function confidenceInterval95(resolvedCount: number, taskCount: number): ConfidenceInterval95 {
	if (taskCount === 0) return { confidenceLevel: 0.95, lower: 0, upper: 0 };
	const z = 1.959963984540054;
	const rate = resolvedCount / taskCount;
	const denominator = 1 + (z * z) / taskCount;
	const center = (rate + (z * z) / (2 * taskCount)) / denominator;
	const margin =
		(z / denominator) *
		Math.sqrt((rate * (1 - rate)) / taskCount + (z * z) / (4 * taskCount * taskCount));
	return {
		confidenceLevel: 0.95,
		lower: Math.max(0, center - margin),
		upper: Math.min(1, center + margin),
	};
}

function scoreTasks(tasks: readonly ScoredTask[]): ScoreSummary {
	let resolvedCount = 0;
	let reportedUnresolvedCount = 0;
	let errorCount = 0;
	let missingResultCount = 0;
	let duplicateResultCount = 0;

	for (const { disposition } of tasks) {
		switch (disposition) {
			case 'resolved':
				resolvedCount++;
				break;
			case 'reported-unresolved':
				reportedUnresolvedCount++;
				break;
			case 'error':
				errorCount++;
				break;
			case 'missing':
				missingResultCount++;
				break;
			case 'duplicate':
				duplicateResultCount++;
				break;
		}
	}

	const taskCount = tasks.length;
	return {
		taskCount,
		resolvedCount,
		unresolvedCount: taskCount - resolvedCount,
		reportedUnresolvedCount,
		errorCount,
		missingResultCount,
		duplicateResultCount,
		resolvedRate: taskCount === 0 ? 0 : resolvedCount / taskCount,
		resolvedRateConfidenceInterval95: confidenceInterval95(resolvedCount, taskCount),
	};
}

function createBreakdown<TKey extends string>(
	tasks: readonly ScoredTask[],
	selectKey: (task: TaskManifest) => TKey | undefined,
): MacroBreakdown<TKey> {
	const groupedTasks = new Map<TKey, ScoredTask[]>();
	let excludedTaskCount = 0;

	for (const scoredTask of tasks) {
		const key = selectKey(scoredTask.task);
		if (key === undefined) {
			excludedTaskCount++;
			continue;
		}
		const group = groupedTasks.get(key);
		if (group === undefined) groupedTasks.set(key, [scoredTask]);
		else group.push(scoredTask);
	}

	const groups = [...groupedTasks]
		.sort(([left], [right]) => compareStrings(left, right))
		.map(([key, groupTasks]) => ({ key, ...scoreTasks(groupTasks) }));
	return {
		groupCount: groups.length,
		taskCount: tasks.length - excludedTaskCount,
		excludedTaskCount,
		macroResolvedRate:
			groups.length === 0
				? 0
				: groups.reduce((total, group) => total + group.resolvedRate, 0) / groups.length,
		groups,
	};
}

function assertRunCompatibility(run: EvaluationRunManifest, result: EvaluationResult): void {
	if (result.runId !== run.runId)
		throw new TypeError(`Result ${result.taskId} has a foreign run ID`);
	if (result.runManifestDigest !== digestRunManifest(run)) {
		throw new TypeError(`Result ${result.taskId} has a foreign run manifest digest`);
	}
	if (result.benchmarkVersion !== run.benchmarkVersion) {
		throw new TypeError(`Result ${result.taskId} has a foreign benchmark version`);
	}
	if (result.taskManifestDigest !== run.taskManifestDigest) {
		throw new TypeError(`Result ${result.taskId} has a foreign task manifest digest`);
	}
	if (result.attempt !== 1) throw new TypeError(`Result ${result.taskId} is not a pass@1 attempt`);
	if (result.outcome === 'resolved') {
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
}

function assertPredictionLinkage(
	run: EvaluationRunManifest,
	result: EvaluationResult,
	predictionsByTaskId: ReadonlyMap<string, readonly Prediction[]>,
): void {
	const predictions = predictionsByTaskId.get(result.taskId);
	if (predictions === undefined) {
		throw new TypeError(`Result ${result.taskId} has no matching prediction`);
	}
	if (predictions.length !== 1) {
		throw new TypeError(`Result ${result.taskId} has ambiguous duplicate predictions`);
	}
	const prediction = predictions[0];
	if (
		prediction.runId !== run.runId ||
		prediction.runManifestDigest !== digestRunManifest(run) ||
		prediction.attempt !== result.attempt
	) {
		throw new TypeError(`Result ${result.taskId} has a foreign prediction identity`);
	}
	if (digestPrediction(prediction) !== result.predictionDigest) {
		throw new TypeError(`Result ${result.taskId} does not match its prediction digest`);
	}
}

function assertTaskCompatibility(task: TaskManifest, result: EvaluationResult): void {
	if (result.graderVersion !== task.grader.graderVersion) {
		throw new TypeError(`Result ${task.taskId} has a stale grader version`);
	}
	if (result.graderDigest !== task.grader.graderDigest) {
		throw new TypeError(`Result ${task.taskId} has a stale grader digest`);
	}
	if (result.scoringPolicyDigest !== task.grader.scoringPolicyDigest) {
		throw new TypeError(`Result ${task.taskId} has a stale scoring-policy digest`);
	}
	const expectedEnvironmentDigest = task.environment.image.slice(
		task.environment.image.lastIndexOf('@') + 1,
	);
	if (result.environmentDigest !== expectedEnvironmentDigest) {
		throw new TypeError(`Result ${task.taskId} has a stale environment digest`);
	}
	const declaredIds = new Set(task.grader.publicCommands.map((command) => command.id));
	const publicResults = result.commands.filter((command) => command.phase === 'public');
	for (const command of publicResults) {
		if (!declaredIds.has(command.id)) {
			throw new TypeError(`Result ${task.taskId} contains undeclared public command ${command.id}`);
		}
	}
	if (result.outcome === 'resolved') {
		for (const command of task.grader.publicCommands) {
			const actual = publicResults.find((resultCommand) => resultCommand.id === command.id);
			if (actual?.outcome !== 'passed') {
				throw new TypeError(
					`Resolved result ${task.taskId} is missing passed command ${command.id}`,
				);
			}
		}
	}
}

/**
 * Creates a deterministic report for one immutable pass@1 run. Missing and
 * duplicate results are unresolved; stale or foreign records are rejected.
 */
export function createEvaluationReport(
	run: EvaluationRunManifest,
	tasks: readonly TaskManifest[],
	predictions: readonly Prediction[],
	results: readonly EvaluationResult[],
): EvaluationReport {
	parseEvaluationRunManifest(run);
	for (const task of tasks) parseTaskManifest(task);
	validateEvaluationTaskSet(run, tasks);
	const orderedTasks = [...tasks].sort((left, right) => compareStrings(left.taskId, right.taskId));
	const tasksById = new Map(orderedTasks.map((task) => [task.taskId, task]));
	const predictionsByTaskId = new Map<string, Prediction[]>();
	for (const prediction of predictions) {
		parsePrediction(prediction);
		if (prediction.runId !== run.runId) {
			throw new TypeError(`Prediction ${prediction.taskId} has a foreign run ID`);
		}
		if (prediction.runManifestDigest !== digestRunManifest(run)) {
			throw new TypeError(`Prediction ${prediction.taskId} has a foreign run manifest digest`);
		}
		const task = tasksById.get(prediction.taskId);
		if (task === undefined) {
			throw new TypeError(`Prediction ${prediction.taskId} is not in the immutable task set`);
		}
		if (prediction.outputType !== task.prompt.outputType) {
			throw new TypeError(`Prediction ${prediction.taskId} has an incompatible output type`);
		}
		const bucket = predictionsByTaskId.get(prediction.taskId);
		if (bucket === undefined) predictionsByTaskId.set(prediction.taskId, [prediction]);
		else bucket.push(prediction);
	}
	for (const [taskId, taskPredictions] of predictionsByTaskId) {
		if (taskPredictions.length > 1) {
			throw new TypeError(`Task ${taskId} has ambiguous duplicate predictions`);
		}
	}
	for (const result of results) {
		parseEvaluationResult(result);
		const task = tasksById.get(result.taskId);
		if (task === undefined) {
			throw new TypeError(`Result ${result.taskId} is not in the immutable task set`);
		}
		assertRunCompatibility(run, result);
		assertPredictionLinkage(run, result, predictionsByTaskId);
		assertTaskCompatibility(task, result);
	}

	const resultsByTaskId = new Map<string, EvaluationResult[]>();
	for (const result of results) {
		const bucket = resultsByTaskId.get(result.taskId);
		if (bucket === undefined) resultsByTaskId.set(result.taskId, [result]);
		else bucket.push(result);
	}

	const duplicateResultIds = [...resultsByTaskId]
		.filter(([, taskResults]) => taskResults.length > 1)
		.map(([taskId]) => taskId)
		.sort(compareStrings);
	const missingTaskIds: string[] = [];

	const scoredTasks = orderedTasks.map((task): ScoredTask => {
		const taskResults = resultsByTaskId.get(task.taskId);
		if (taskResults === undefined) {
			missingTaskIds.push(task.taskId);
			return { task, disposition: 'missing' };
		}
		if (taskResults.length > 1) return { task, disposition: 'duplicate' };

		const result = taskResults[0];
		return {
			task,
			result,
			disposition:
				result.outcome === 'resolved'
					? 'resolved'
					: result.outcome === 'error'
						? 'error'
						: 'reported-unresolved',
		};
	});
	missingTaskIds.sort(compareStrings);

	return {
		runId: run.runId,
		runManifestDigest: digestRunManifest(run),
		benchmarkVersion: run.benchmarkVersion,
		taskManifestDigest: run.taskManifestDigest,
		executionMode: run.executionMode,
		contextMode: run.context.mode,
		overall: scoreTasks(scoredTasks),
		bySuite: createBreakdown(scoredTasks, (task) => task.suite),
		byCapability: createBreakdown(scoredTasks, (task) => task.capability),
		byPortShape: createBreakdown(scoredTasks, (task) => task.portShape),
		byPackage: createBreakdown(scoredTasks, (task) => task.packageName),
		tasks: scoredTasks.map(({ task, disposition, result }) => ({
			taskId: task.taskId,
			suite: task.suite,
			capability: task.capability,
			portShape: task.portShape,
			packageName: task.packageName,
			disposition,
			result,
		})),
		diagnostics: { missingTaskIds, duplicateResultIds },
	};
}
