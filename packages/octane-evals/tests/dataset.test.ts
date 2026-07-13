import { describe, expect, it } from 'vitest';
import {
	validateEvaluationTaskSet,
	validateNoFamilyLeakage,
	validateTaskManifestCollection,
} from '../src/dataset.js';
import { digestTaskManifests } from '../src/digest.js';
import { createRun, createTask } from './_fixtures.js';

describe('task-set invariants', () => {
	it('rejects duplicate task IDs and family leakage across splits', () => {
		const first = createTask('first', { familyId: 'shared-family', split: 'dev' });
		const leaked = createTask('second', { familyId: 'shared-family', split: 'train' });
		expect(() => validateTaskManifestCollection([first, leaked])).toThrow(/family.*crosses/);
		expect(() => validateTaskManifestCollection([first, first])).toThrow(/duplicate task ID/);
		expect(() => validateNoFamilyLeakage([first, leaked])).toThrow(/family.*crosses/);
		expect(
			validateNoFamilyLeakage([
				first,
				createTask('different-family', { familyId: 'other-family', split: 'train' }),
			]),
		).toHaveLength(2);
	});

	it('rejects incomparable modes, contexts, and benchmark versions in one set', () => {
		const first = createTask('first');
		const otherMode = createTask('second', { executionMode: 'completion' });
		expect(() => validateTaskManifestCollection([first, otherMode])).toThrow(/execution mode/);

		const otherBenchmark = createTask('third', { benchmarkVersion: 'dev-2' });
		expect(() => validateTaskManifestCollection([first, otherBenchmark])).toThrow(
			/benchmark version/,
		);
	});

	it('binds a run to the canonical task digest, scoring policy, and limits', () => {
		const tasks = [createTask('one'), createTask('two')];
		const run = createRun(tasks);
		expect(validateEvaluationTaskSet(run, tasks)).toBe(tasks);
		expect(digestTaskManifests([...tasks].reverse())).toBe(run.taskManifestDigest);

		const stale = { ...run, taskManifestDigest: `sha256:${'0'.repeat(64)}` };
		expect(() => validateEvaluationTaskSet(stale, tasks)).toThrow(/canonical digest/);
	});
});
