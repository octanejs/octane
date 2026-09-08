import { describe, expect, it } from 'vitest';
import * as binding from '@octanejs/thinking-orbs';
import * as upstream from 'thinking-orbs';

describe('@octanejs/thinking-orbs — exports', () => {
	it('matches the upstream public surface', () => {
		for (const name of ['ThinkingOrb', 'resolvePreset', 'MODE_DRAWS'] as const) {
			expect(typeof binding[name]).toBe(typeof upstream[name]);
		}
	});
});
