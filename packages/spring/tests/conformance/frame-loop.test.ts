import { afterEach, describe, expect, it } from 'vitest';
import { frameLoop, type OpaqueAnimation } from '../../src/shared/index';

// Additional upstream provenance for shared adapted evidence:
// Per packages/core/src/FrameLoopDemand.test.ts:83

afterEach(() => frameLoop.clear());

describe('upstream frame loop parity', () => {
	// Per packages/rafz/src/index.test.ts:15
	it('advances animations in ascending priority and retains active work', () => {
		const calls: string[] = [];
		const animation = (name: string, priority: number, frames: number): OpaqueAnimation => ({
			idle: false,
			priority,
			advance() {
				calls.push(name);
				if (--frames === 0) this.idle = true;
			},
		});
		frameLoop.start(animation('later', 2, 1));
		frameLoop.start(animation('first', 1, 2));

		expect(frameLoop.advance(16)).toBe(true);
		expect(calls).toEqual(['first', 'later']);
		expect(frameLoop.advance(16)).toBe(false);
		expect(calls).toEqual(['first', 'later', 'first']);
		expect(frameLoop.idle).toBe(true);
	});
});
