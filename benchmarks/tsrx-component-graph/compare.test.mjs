import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateProcesses, assertReferenceState, evaluateGates } from './compare.mjs';

function measuredProcess(implementation, rootFirstMs, leafFirstMs) {
	return {
		implementation,
		rootFirst: { samples: Array(16).fill(rootFirstMs) },
		leafFirst: { samples: Array(16).fill(leafFirstMs) },
	};
}

test('cross-process scores preserve both sides of the balanced process order', () => {
	const processes = [
		measuredProcess('main', 1000, 500),
		measuredProcess('candidate', 1010, 500),
		measuredProcess('candidate', 1020, 500),
		measuredProcess('main', 1060, 500),
	];
	const attempt = {
		aggregate: {
			main: aggregateProcesses(processes, 'main'),
			candidate: aggregateProcesses(processes, 'candidate'),
		},
	};

	assert.equal(attempt.aggregate.main.rootFirst.stat.score, 1030);
	assert.equal(attempt.aggregate.candidate.rootFirst.stat.score, 1015);
	assert.equal(
		evaluateGates({ maxOrderRatio: 3, minRootImprovementMs: 25 }, attempt)
			.conservativeRootImprovementMs.passed,
		false,
	);
});

test('reference state must match the full requested revision and be clean', () => {
	const revision = 'a'.repeat(40);
	assert.doesNotThrow(() =>
		assertReferenceState({ head: revision, dirty: false, changes: [] }, revision),
	);
	assert.throws(
		() => assertReferenceState({ head: 'b'.repeat(40), dirty: false, changes: [] }, revision),
		/expected --reference-revision/,
	);
	assert.throws(
		() =>
			assertReferenceState({ head: revision, dirty: true, changes: ['?? compiler.js'] }, revision),
		/has changes/,
	);
});
