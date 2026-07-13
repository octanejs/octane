import { describe, expect, it, vi } from 'vitest';
import { runEvaluation } from '../src/runner.js';
import type { Prediction } from '../src/schema.js';
import { createPrediction, createResult, createRun, createTask } from './_fixtures.js';

describe('runEvaluation', () => {
	it('grades valid predictions concurrently while preserving task order', async () => {
		const tasks = [createTask('slow'), createTask('fast')];
		const run = createRun(tasks);
		const predictions = tasks.map((task) => createPrediction(run, task));
		const grade = vi.fn(async (task, prediction) => {
			if (task.taskId === 'slow') await new Promise((resolve) => setTimeout(resolve, 10));
			return createResult(run, task, prediction);
		});

		const evaluation = await runEvaluation(run, tasks, predictions, grade, { concurrency: 2 });

		expect(evaluation.results.map((entry) => entry.taskId)).toEqual(['fast', 'slow']);
		expect(evaluation.acceptedPredictions.map((entry) => entry.taskId)).toEqual(['fast', 'slow']);
		expect(grade).toHaveBeenCalledTimes(2);
		expect(grade.mock.calls.map(([task, , context]) => [task.taskId, context.index])).toEqual([
			['fast', 0],
			['slow', 1],
		]);
		const reversed = await runEvaluation(
			run,
			[...tasks].reverse(),
			predictions,
			async (task, submitted) => createResult(run, task, submitted),
			{ concurrency: 2 },
		);
		expect(reversed.results).toEqual(evaluation.results);
		expect(evaluation.diagnostics).toEqual({
			missingPredictionTaskIds: [],
			duplicatePredictionTaskIds: [],
			incompatiblePredictionTaskIds: [],
			foreignRunPredictionTaskIds: [],
			unknownPredictionTaskIds: [],
		});
	});

	it('does not grade missing, duplicate, incompatible, foreign-run, or unknown predictions', async () => {
		const tasks = [
			createTask('valid'),
			createTask('duplicate'),
			createTask('incompatible'),
			createTask('foreign'),
			createTask('missing'),
		];
		const run = createRun(tasks);
		const byId = new Map(tasks.map((task) => [task.taskId, task]));
		const prediction = (taskId: string): Prediction =>
			createPrediction(run, byId.get(taskId) ?? createTask(taskId));
		const predictions = [
			prediction('valid'),
			prediction('duplicate'),
			prediction('unknown'),
			prediction('duplicate'),
			{ ...prediction('incompatible'), outputType: 'completion' as const },
			{ ...prediction('foreign'), runId: 'other-run' },
		];
		const grade = vi.fn(async (task, submitted) => createResult(run, task, submitted));

		const evaluation = await runEvaluation(run, tasks, predictions, grade);

		expect(evaluation.results.map((entry) => entry.taskId)).toEqual(['valid']);
		expect(evaluation.acceptedPredictions.map((entry) => entry.taskId)).toEqual(['valid']);
		expect(grade).toHaveBeenCalledTimes(1);
		expect(evaluation.diagnostics).toEqual({
			missingPredictionTaskIds: ['missing'],
			duplicatePredictionTaskIds: ['duplicate'],
			incompatiblePredictionTaskIds: ['incompatible'],
			foreignRunPredictionTaskIds: ['foreign'],
			unknownPredictionTaskIds: ['unknown'],
		});
	});

	it('rejects invalid concurrency and inconsistent grader records', async () => {
		const task = createTask('one');
		const run = createRun([task]);
		const prediction = createPrediction(run, task);

		await expect(
			runEvaluation(run, [task], [prediction], async () => ({
				...createResult(run, task, prediction),
				taskId: 'other',
			})),
		).rejects.toThrowError('Grader returned task ID "other" for "one"');

		await expect(
			runEvaluation(run, [task], [prediction], async () => createResult(run, task, prediction), {
				concurrency: 0,
			}),
		).rejects.toThrowError('concurrency must be a positive integer');
	});

	it('rejects duplicate task manifests and mismatched prediction digests', async () => {
		const task = createTask('same');
		const duplicateTasks = [task, task];
		const duplicateRun = createRun(duplicateTasks);
		await expect(
			runEvaluation(duplicateRun, duplicateTasks, [], async () => {
				throw new Error('not reached');
			}),
		).rejects.toThrowError(/duplicate task ID/);

		const run = createRun([task]);
		const prediction = createPrediction(run, task);
		await expect(
			runEvaluation(run, [task], [prediction], async () => ({
				...createResult(run, task, prediction),
				predictionDigest: `sha256:${'0'.repeat(64)}`,
			})),
		).rejects.toThrowError(/prediction digest does not match/);

		await expect(
			runEvaluation(run, [task], [prediction], async () => ({
				...createResult(run, task, prediction),
				metrics: {
					...createResult(run, task, prediction).metrics,
					toolCalls: run.limits.maxToolCalls + 1,
				},
			})),
		).rejects.toThrowError(/exceeds the tool-call budget/);
	});

	it('waits for in-flight graders to settle after the first failure', async () => {
		const tasks = [createTask('a-fail'), createTask('b-slow'), createTask('c-never')];
		const run = createRun(tasks);
		const predictions = tasks.map((task) => createPrediction(run, task));
		const events: string[] = [];

		await expect(
			runEvaluation(
				run,
				tasks,
				predictions,
				async (task, prediction) => {
					events.push(`${task.taskId}:start`);
					if (task.taskId === 'a-fail') throw new Error('grader failed');
					if (task.taskId === 'b-slow') {
						await new Promise((resolve) => setTimeout(resolve, 10));
						events.push(`${task.taskId}:finish`);
					}
					return createResult(run, task, prediction);
				},
				{ concurrency: 2 },
			),
		).rejects.toThrow('grader failed');

		expect(events).toEqual(['a-fail:start', 'b-slow:start', 'b-slow:finish']);
	});
});
