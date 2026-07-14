import { describe, expect, it } from 'vitest';
import { createEvaluationReport } from '../src/reporting.js';
import type { BreakdownGroup, EvaluationReport } from '../src/reporting.js';
import type { EvaluationResult, ResultOutcome, TaskManifest } from '../src/schema.js';
import { createPrediction, createResult, createRun, createTask } from './_fixtures.js';

function groupsByKey<TKey extends string>(groups: BreakdownGroup<TKey>[]) {
	return Object.fromEntries(groups.map((group) => [group.key, group])) as Record<
		TKey,
		BreakdownGroup<TKey>
	>;
}

function resultFor(
	run: ReturnType<typeof createRun>,
	task: TaskManifest,
	outcome: ResultOutcome = 'resolved',
): EvaluationResult {
	return createResult(run, task, createPrediction(run, task), outcome);
}

describe('createEvaluationReport', () => {
	it('uses every task in the strict denominator and exposes macro breakdowns', () => {
		const tasks = [
			createTask('tsrx-resolved', { suite: 'tsrx', capability: 'authoring' }),
			createTask('tsrx-unresolved', { suite: 'tsrx', capability: 'migration' }),
			createTask('octane-context', { suite: 'octane', capability: 'authoring' }),
			createTask('port-a', {
				suite: 'integration',
				capability: 'api-integration',
				portShape: 'core-adapter',
				packageName: '@octanejs/a',
			}),
			createTask('port-b', {
				suite: 'integration',
				capability: 'api-integration',
				portShape: 'core-adapter',
				packageName: '@octanejs/a',
			}),
			createTask('port-error', {
				suite: 'integration',
				capability: 'divergence-recognition',
				portShape: 'dom-component',
				packageName: '@octanejs/b',
			}),
		];
		const run = createRun(tasks);
		const predictions = tasks.map((task) => createPrediction(run, task));
		const results = [
			resultFor(run, tasks[0]),
			resultFor(run, tasks[1], 'unresolved'),
			resultFor(run, tasks[3]),
			resultFor(run, tasks[4]),
			resultFor(run, tasks[5], 'error'),
		];

		const report = createEvaluationReport(run, tasks, predictions, results);
		expect(createEvaluationReport(run, [...tasks].reverse(), predictions, results)).toEqual(report);

		expect(report).toMatchObject({
			runId: run.runId,
			runManifestDigest: expect.stringMatching(/^sha256:/),
			benchmarkVersion: run.benchmarkVersion,
			taskManifestDigest: run.taskManifestDigest,
			executionMode: 'agentic',
			contextMode: 'framework-docs',
		});
		expect(report.overall).toMatchObject({
			taskCount: 6,
			resolvedCount: 3,
			unresolvedCount: 3,
			reportedUnresolvedCount: 1,
			errorCount: 1,
			missingResultCount: 1,
			duplicateResultCount: 0,
			resolvedRate: 0.5,
		});
		expect(report.overall.resolvedRateConfidenceInterval95.lower).toBeLessThan(0.5);
		expect(report.overall.resolvedRateConfidenceInterval95.upper).toBeGreaterThan(0.5);

		const suites = groupsByKey(report.bySuite.groups);
		expect(report.bySuite).toMatchObject({ groupCount: 3, taskCount: 6, excludedTaskCount: 0 });
		expect(report.bySuite.macroResolvedRate).toBeCloseTo(7 / 18);
		expect(suites.integration).toMatchObject({ taskCount: 3, resolvedCount: 2 });
		expect(suites.octane).toMatchObject({ taskCount: 1, resolvedCount: 0, missingResultCount: 1 });
		expect(suites.tsrx).toMatchObject({ taskCount: 2, resolvedCount: 1 });

		const portShapes = groupsByKey(report.byPortShape.groups);
		expect(report.byPortShape).toMatchObject({
			groupCount: 2,
			taskCount: 3,
			excludedTaskCount: 3,
			macroResolvedRate: 0.5,
		});
		expect(portShapes['core-adapter']).toMatchObject({ taskCount: 2, resolvedCount: 2 });
		expect(portShapes['dom-component']).toMatchObject({ taskCount: 1, resolvedCount: 0 });
		expect(report.byPackage).toMatchObject({
			groupCount: 2,
			taskCount: 3,
			excludedTaskCount: 3,
			macroResolvedRate: 0.5,
		});
		expect(report.tasks.find((row) => row.taskId === 'port-error')).toMatchObject({
			disposition: 'error',
			result: { outcome: 'error', commands: [{ id: 'public-test', outcome: 'passed' }] },
		});
		expect(report.diagnostics).toEqual({
			missingTaskIds: ['octane-context'],
			duplicateResultIds: [],
		});
	});

	it('makes duplicate results unresolved without depending on result order', () => {
		const tasks = [createTask('duplicate'), createTask('resolved'), createTask('missing')];
		const run = createRun(tasks);
		const predictions = tasks.map((task) => createPrediction(run, task));
		const results = [
			resultFor(run, tasks[0]),
			resultFor(run, tasks[1]),
			resultFor(run, tasks[0], 'unresolved'),
		];

		const report = createEvaluationReport(run, tasks, predictions, results);
		const reversedReport = createEvaluationReport(run, tasks, predictions, [...results].reverse());

		expect(reversedReport).toEqual(report);
		expect(report.overall).toMatchObject({
			taskCount: 3,
			resolvedCount: 1,
			unresolvedCount: 2,
			missingResultCount: 1,
			duplicateResultCount: 1,
			resolvedRate: 1 / 3,
		});
		expect(report.diagnostics).toEqual({
			missingTaskIds: ['missing'],
			duplicateResultIds: ['duplicate'],
		});
	});

	it('rejects duplicate task manifests and stale results', () => {
		const task = createTask('same');
		const duplicateTasks = [task, task];
		const duplicateRun = createRun(duplicateTasks);
		expect(() => createEvaluationReport(duplicateRun, duplicateTasks, [], [])).toThrow(
			/duplicate task ID/,
		);

		const run = createRun([task]);
		const prediction = createPrediction(run, task);
		const stale = { ...resultFor(run, task), graderVersion: 'old-grader' };
		expect(() => createEvaluationReport(run, [task], [prediction], [stale])).toThrow(
			/stale grader version/,
		);
		const staleDigest = {
			...resultFor(run, task),
			graderDigest: `sha256:${'9'.repeat(64)}`,
		};
		expect(() => createEvaluationReport(run, [task], [prediction], [staleDigest])).toThrow(
			/stale grader digest/,
		);

		const foreign = { ...resultFor(run, task), runId: 'other-run' };
		expect(() => createEvaluationReport(run, [task], [prediction], [foreign])).toThrow(
			/foreign run ID/,
		);

		const alteredPrediction = { ...prediction, output: 'different patch' };
		expect(() =>
			createEvaluationReport(run, [task], [alteredPrediction], [resultFor(run, task)]),
		).toThrow(/does not match its prediction digest/);

		const wrongOutputType = { ...prediction, outputType: 'completion' as const };
		expect(() => createEvaluationReport(run, [task], [wrongOutputType], [])).toThrow(
			/incompatible output type/,
		);

		const missingPublicCommand = { ...resultFor(run, task), commands: [] };
		expect(() => createEvaluationReport(run, [task], [prediction], [missingPublicCommand])).toThrow(
			/missing passed command public-test/,
		);

		const alteredRun = {
			...run,
			model: { ...run.model, revision: '2026-07-14' },
		};
		expect(() => createEvaluationReport(alteredRun, [task], [prediction], [])).toThrow(
			/foreign run manifest digest/,
		);

		const overBudget = {
			...resultFor(run, task),
			metrics: { ...resultFor(run, task).metrics, turns: run.limits.maxTurns + 1 },
		};
		expect(() => createEvaluationReport(run, [task], [prediction], [overBudget])).toThrow(
			/exceeds the turn budget/,
		);
	});

	it('returns zero rates for an empty task set', () => {
		const tasks: TaskManifest[] = [];
		const run = createRun(tasks);
		const report: EvaluationReport = createEvaluationReport(run, tasks, [], []);

		expect(report.overall.resolvedRate).toBe(0);
		expect(report.overall.resolvedRateConfidenceInterval95).toEqual({
			confidenceLevel: 0.95,
			lower: 0,
			upper: 0,
		});
		expect(report.bySuite).toEqual({
			groupCount: 0,
			taskCount: 0,
			excludedTaskCount: 0,
			macroResolvedRate: 0,
			groups: [],
		});
		expect(report.diagnostics).toEqual({
			missingTaskIds: [],
			duplicateResultIds: [],
		});
	});

	it('rejects prediction and result rows outside the immutable task set', () => {
		const task = createTask('known');
		const run = createRun([task]);
		const knownPrediction = createPrediction(run, task);
		const unknown = createTask('unknown');
		const unknownPrediction = createPrediction(run, unknown);

		expect(() => createEvaluationReport(run, [task], [unknownPrediction], [])).toThrow(
			/not in the immutable task set/,
		);
		expect(() =>
			createEvaluationReport(run, [task], [knownPrediction], [resultFor(run, unknown)]),
		).toThrow(/not in the immutable task set/);
	});
});
