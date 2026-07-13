import { canonicalJson, digestTaskManifests } from './digest.js';
import type { EvaluationRunManifest, ExecutionLimits, TaskManifest } from './schema.js';

export interface DatasetIssue {
	path: string;
	message: string;
}

export class DatasetValidationError extends TypeError {
	readonly issues: readonly DatasetIssue[];

	constructor(label: string, issues: readonly DatasetIssue[]) {
		super(
			`${label} is invalid:\n${issues.map((issue) => `  - ${issue.path}: ${issue.message}`).join('\n')}`,
		);
		this.name = 'DatasetValidationError';
		this.issues = issues;
	}
}

function uniqueValues<T>(values: readonly T[]): T[] {
	return [...new Set(values)];
}

function requireOneValue<T>(
	values: readonly T[],
	path: string,
	label: string,
	issues: DatasetIssue[],
): void {
	if (uniqueValues(values).length > 1) {
		issues.push({ path, message: `mixed ${label} values are not comparable in one task set` });
	}
}

function collectFamilyLeakageIssues(tasks: readonly TaskManifest[]): DatasetIssue[] {
	const issues: DatasetIssue[] = [];
	const familySplits = new Map<string, TaskManifest['split']>();
	for (let index = 0; index < tasks.length; index++) {
		const task = tasks[index];
		const familySplit = familySplits.get(task.familyId);
		if (familySplit !== undefined && familySplit !== task.split) {
			issues.push({
				path: `$[${index}].familyId`,
				message: `family ${task.familyId} crosses the ${familySplit} and ${task.split} splits`,
			});
		} else {
			familySplits.set(task.familyId, task.split);
		}
	}
	return issues;
}

/** Validate a complete candidate corpus before writing its per-split files. */
export function validateNoFamilyLeakage<T extends TaskManifest>(tasks: readonly T[]): readonly T[] {
	const issues = collectFamilyLeakageIssues(tasks);
	if (issues.length > 0) throw new DatasetValidationError('Dataset partition', issues);
	return tasks;
}

/** Enforces invariants that cannot be checked one JSONL row at a time. */
export function validateTaskManifestCollection<T extends TaskManifest>(
	tasks: readonly T[],
): readonly T[] {
	const issues: DatasetIssue[] = [];
	const taskIds = new Set<string>();

	for (let index = 0; index < tasks.length; index++) {
		const task = tasks[index];
		if (taskIds.has(task.taskId)) {
			issues.push({ path: `$[${index}].taskId`, message: `duplicate task ID ${task.taskId}` });
		}
		taskIds.add(task.taskId);
	}
	issues.push(...collectFamilyLeakageIssues(tasks));

	requireOneValue(
		tasks.map((task) => task.benchmarkVersion),
		'$.benchmarkVersion',
		'benchmark version',
		issues,
	);
	requireOneValue(
		tasks.map((task) => task.split),
		'$.split',
		'dataset split',
		issues,
	);
	requireOneValue(
		tasks.map((task) => task.executionMode),
		'$.executionMode',
		'execution mode',
		issues,
	);
	requireOneValue(
		tasks.map((task) => canonicalJson(task.context)),
		'$.context',
		'context',
		issues,
	);

	if (issues.length > 0) throw new DatasetValidationError('Task manifest collection', issues);
	return tasks;
}

function sameLimits(left: ExecutionLimits, right: ExecutionLimits): boolean {
	const keys: Array<keyof ExecutionLimits> = [
		'timeoutSeconds',
		'cpu',
		'memoryMb',
		'maxProcesses',
		'maxDiskMb',
		'maxOutputBytes',
		'maxTurns',
		'maxTotalTokens',
		'maxToolCalls',
	];
	return keys.every((key) => left[key] === right[key]);
}

/** Binds a homogeneous task set to the immutable configuration of one run. */
export function validateEvaluationTaskSet(
	run: EvaluationRunManifest,
	tasks: readonly TaskManifest[],
): readonly TaskManifest[] {
	validateTaskManifestCollection(tasks);
	const issues: DatasetIssue[] = [];

	for (let index = 0; index < tasks.length; index++) {
		const task = tasks[index];
		const path = `$[${index}]`;
		if (task.benchmarkVersion !== run.benchmarkVersion) {
			issues.push({ path: `${path}.benchmarkVersion`, message: 'does not match the run manifest' });
		}
		if (task.executionMode !== run.executionMode) {
			issues.push({ path: `${path}.executionMode`, message: 'does not match the run manifest' });
		}
		if (canonicalJson(task.context) !== canonicalJson(run.context)) {
			issues.push({ path: `${path}.context`, message: 'does not match the run manifest' });
		}
		if (task.grader.scoringPolicyDigest !== run.scoringPolicyDigest) {
			issues.push({
				path: `${path}.grader.scoringPolicyDigest`,
				message: 'does not match the run manifest',
			});
		}
		if (!sameLimits(task.policy, run.limits)) {
			issues.push({
				path: `${path}.policy`,
				message: 'execution limits do not match the run manifest',
			});
		}
	}

	if (digestTaskManifests(tasks) !== run.taskManifestDigest) {
		issues.push({
			path: '$.taskManifestDigest',
			message: 'does not match the canonical digest of the supplied task set',
		});
	}

	if (issues.length > 0) throw new DatasetValidationError('Evaluation task set', issues);
	return tasks;
}
