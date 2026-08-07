/**
 * @vis.gl/react-mapbox 8.1.2's own framework-neutral util specs, run byte-exact
 * from the vendored tree (pristine side).
 *
 * The spec files cannot be annotated without ceasing to be byte-exact, so their
 * cases are collected here and declared one-for-one. A renamed or deleted
 * upstream case fails collection rather than silently disappearing.
 */
import { describe, expect, it } from 'vitest';
import { beginCollection, endCollection, runCollected } from '../_harness/tape-adapter';

const collected = beginCollection();
await import('../../upstream/test/utils/apply-react-style.spec.js');
await import('../../upstream/test/utils/compare-class-names.spec.js');
await import('../../upstream/test/utils/deep-equal.spec.js');
await import('../../upstream/test/utils/style-utils.spec.js');
await import('../../upstream/test/utils/transform.spec.js');
endCollection();

describe('upstream util specs (pristine)', () => {
	// @parity-case upstream-util-pristine:1
	it('applyReactStyle', () => runCollected(collected, 'applyReactStyle'));

	// @parity-case upstream-util-pristine:2
	it('compareClassNames', () => runCollected(collected, 'compareClassNames'));

	// @parity-case upstream-util-pristine:3
	it('deepEqual', () => runCollected(collected, 'deepEqual'));

	// @parity-case upstream-util-pristine:4
	it('arePointsEqual', () => runCollected(collected, 'arePointsEqual'));

	// @parity-case upstream-util-pristine:5
	it('normalizeStyle', () => runCollected(collected, 'normalizeStyle'));

	// @parity-case upstream-util-pristine:6
	it('applyViewStateToTransform', () => runCollected(collected, 'applyViewStateToTransform'));

	// Every collected upstream case must be declared above; a new upstream case
	// must not slip through unrun.
	// @parity-case upstream-util-pristine:7
	it('declares every collected upstream case', () => {
		expect([...collected.keys()].sort()).toEqual(
			[
				'applyReactStyle',
				'applyViewStateToTransform',
				'arePointsEqual',
				'compareClassNames',
				'deepEqual',
				'normalizeStyle',
			].sort(),
		);
	});
});
