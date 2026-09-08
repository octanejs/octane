import assert from 'node:assert/strict';
import test from 'node:test';
import {
	aggregateProcesses,
	assertEquivalentOutputs,
	assertReferenceState,
	evaluateGates,
} from './compare.mjs';

function measuredProcess(implementation, measurements) {
	return {
		implementation,
		targets: Object.fromEntries(
			Object.entries(measurements).map(([name, elapsed]) => [name, Array(8).fill(elapsed)]),
		),
	};
}

const mainMeasurements = {
	'dependent-first-high-1000': 100,
	'dependency-first-high-1000': 50,
	'dependent-first-low-40': 5,
	'dependency-first-low-40': 5,
};

const candidateMeasurements = {
	'dependent-first-high-1000': 70,
	'dependency-first-high-1000': 68,
	'dependent-first-low-40': 5.25,
	'dependency-first-low-40': 5.25,
};

function passingAttempt() {
	const processes = [
		measuredProcess('main', mainMeasurements),
		measuredProcess('candidate', candidateMeasurements),
		measuredProcess('candidate', candidateMeasurements),
		measuredProcess('main', mainMeasurements),
	];
	return {
		aggregate: {
			main: aggregateProcesses(processes, 'main'),
			candidate: aggregateProcesses(processes, 'candidate'),
		},
	};
}

test('accepts a conservative high-cardinality win with a stable ordinary control', () => {
	const gates = evaluateGates(passingAttempt());
	assert.equal(gates.highCardinality.passed, true);
	assert.equal(gates.declarationOrder.passed, true);
	assert.equal(gates.ordinarySize.passed, true);
});

test('fails closed when the high-cardinality improvement is immaterial', () => {
	const attempt = passingAttempt();
	attempt.aggregate.candidate['dependent-first-high-1000'] =
		attempt.aggregate.main['dependent-first-high-1000'];
	assert.equal(evaluateGates(attempt).highCardinality.passed, false);
});

test('rejects an ordinary-size regression independently', () => {
	const attempt = passingAttempt();
	for (const name of ['dependent-first-low-40', 'dependency-first-low-40']) {
		attempt.aggregate.candidate[name] = {
			...attempt.aggregate.candidate[name],
			score: attempt.aggregate.main[name].score * 1.11,
			min: attempt.aggregate.main[name].min * 1.11,
		};
	}
	assert.equal(evaluateGates(attempt).ordinarySize.passed, false);
});

test('reference state must match the requested revision and be clean', () => {
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

test('rejects output drift in semantic controls as well as timed targets', () => {
	const process = (implementation) => ({
		implementation,
		outputHashes: { 'dependent-first-high-1000': 'target-hash' },
		semanticControlHashes: { 'safe-cycle': 'control-hash' },
	});
	const processes = [process('main'), process('candidate')];
	assert.doesNotThrow(() => assertEquivalentOutputs(processes));
	processes[1].semanticControlHashes['safe-cycle'] = 'changed-control-hash';
	assert.throws(
		() => assertEquivalentOutputs(processes),
		/semantic control safe-cycle emitted different code/,
	);
});
