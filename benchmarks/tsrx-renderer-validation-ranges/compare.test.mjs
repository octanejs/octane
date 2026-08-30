import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateComparison } from './compare.mjs';

function payload(scores) {
	return {
		targets: Object.entries(scores).map(([name, score]) => ({
			name,
			ops: { compile: { score, rme: 0, scoreRme: 0 } },
		})),
	};
}

const baseline = payload({
	'focused-high': 120,
	'focused-low': 10,
	'pipeline-validated-high': 240,
	'pipeline-reference-high': 120,
	'pipeline-validated-low': 40,
	'pipeline-reference-low': 40,
});

function passingCandidate() {
	return payload({
		'focused-high': 40,
		'focused-low': 10.5,
		'pipeline-validated-high': 180,
		'pipeline-reference-high': 120,
		'pipeline-validated-low': 42,
		'pipeline-reference-low': 42,
	});
}

describe('renderer-validation comparison gates', () => {
	it('accepts a material high-cardinality win without a low-cardinality regression', () => {
		const result = evaluateComparison(baseline, passingCandidate());
		assert.equal(result.pass, true);
	});

	it('fails closed for identical checkouts', () => {
		assert.equal(evaluateComparison(baseline, baseline).pass, false);
	});

	it('does not mistake reversed checkout order for an improvement', () => {
		assert.equal(evaluateComparison(passingCandidate(), baseline).pass, false);
	});

	it('uses conservative uncertainty bounds for the pipeline gates', () => {
		const noisyCandidate = passingCandidate();
		for (const target of noisyCandidate.targets) {
			if (target.name.startsWith('pipeline-') && target.name.endsWith('-high')) {
				target.ops.compile.rme = 20;
				target.ops.compile.scoreRme = 20;
			}
		}
		const result = evaluateComparison(baseline, noisyCandidate);
		assert.equal(result.gates.focusedAbsolute, true);
		assert.equal(result.gates.focusedRatio, true);
		assert.equal(result.gates.lowCardinality, true);
		assert.equal(result.gates.pipelineRatio, false);
		assert.equal(result.pass, false);
	});

	it('rejects a low-cardinality regression independently', () => {
		const candidate = passingCandidate();
		candidate.targets.find((target) => target.name === 'focused-low').ops.compile.score = 12;
		const result = evaluateComparison(baseline, candidate);
		assert.equal(result.gates.focusedAbsolute, true);
		assert.equal(result.gates.focusedRatio, true);
		assert.equal(result.gates.pipelineRatio, true);
		assert.equal(result.gates.lowCardinality, false);
		assert.equal(result.pass, false);
	});

	it('reports validation-overhead improvement without adding a second retention gate', () => {
		const candidate = passingCandidate();
		candidate.targets.find(
			(target) => target.name === 'pipeline-reference-high',
		).ops.compile.score = 80;
		const result = evaluateComparison(baseline, candidate);
		assert.equal(result.gates.focusedAbsolute, true);
		assert.equal(result.gates.focusedRatio, true);
		assert.equal(result.gates.lowCardinality, true);
		assert.equal(result.pipelineRatio >= 1.2, true);
		assert.equal(result.pipelineOverheadRatio < 1.2, true);
		assert.equal(result.gates.pipelineRatio, true);
		assert.equal(result.pass, true);
	});
});
