import { describe, expect, it } from 'vitest';
import * as binding from '../../src/index';
import * as parallax from '../../src/parallax';
import { SpringValue } from '../../src/engine';
import crosswalk from '../../audit/export-crosswalk.json';

describe('pinned public runtime exports', () => {
	it('matches @react-spring/web@10.1.2 in both directions', () => {
		expect(Object.keys(binding).sort()).toEqual(Object.keys(crosswalk.root).sort());
		expect(new SpringValue(0)).toBeInstanceOf(binding.FrameValue);
	});

	it('matches @react-spring/parallax@10.1.2 in both directions', () => {
		expect(Object.keys(parallax).sort()).toEqual(Object.keys(crosswalk.parallax).sort());
	});
});
