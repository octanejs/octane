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

describe('renderer-validation comparison gates', () => {
	it('accepts a material high-cardinality win without a low-cardinality regression', () => {
		const result = evaluateComparison(
			baseline,
			payload({
				'focused-high': 40,
				'focused-low': 10.5,
				'pipeline-validated-high': 180,
				'pipeline-reference-high': 120,
				'pipeline-validated-low': 42,
				'pipeline-reference-low': 42,
			}),
		);
		assert.equal(result.pass, true);
	});

	it('fails closed for identical checkouts', () => {
		assert.equal(evaluateComparison(baseline, baseline).pass, false);
	});

	it('does not mistake reversed checkout order for an improvement', () => {
		const candidate = payload({
			'focused-high': 40,
			'focused-low': 10,
			'pipeline-validated-high': 180,
			'pipeline-reference-high': 120,
			'pipeline-validated-low': 40,
			'pipeline-reference-low': 40,
		});
		assert.equal(evaluateComparison(candidate, baseline).pass, false);
	});

	it('uses conservative uncertainty bounds', () => {
		const noisyCandidate = payload({
			'focused-high': 60,
			'focused-low': 10,
			'pipeline-validated-high': 180,
			'pipeline-reference-high': 120,
			'pipeline-validated-low': 40,
			'pipeline-reference-low': 40,
		});
		for (const target of noisyCandidate.targets) {
			target.ops.compile.rme = 20;
			target.ops.compile.scoreRme = 20;
		}
		assert.equal(evaluateComparison(baseline, noisyCandidate).pass, false);
	});
});
