import { describe, expect, it } from 'vitest';
import { shouldClearToolbarSelectHover } from '../src/utils/should-clear-toolbar-select-hover.js';

describe('shouldClearToolbarSelectHover', () => {
	const toolbar = { left: 600, top: 670, right: 660, bottom: 700 };

	it('keeps hover while the pointer remains over the toolbar', () => {
		expect(shouldClearToolbarSelectHover(true, 630, 685, toolbar)).toBe(false);
	});

	it('clears hover once the pointer leaves the toolbar bounds', () => {
		expect(shouldClearToolbarSelectHover(true, 100, 100, toolbar)).toBe(true);
	});

	it('clears hover when the toolbar rect is missing', () => {
		expect(shouldClearToolbarSelectHover(true, 630, 685, null)).toBe(true);
	});

	it('does nothing when hover was already false', () => {
		expect(shouldClearToolbarSelectHover(false, 100, 100, toolbar)).toBe(false);
	});
});
